import { describe, it, expect, vi, beforeEach } from "vitest"
import { Types } from "mongoose"
import { PaymentService } from "@/modules/payment/payment.service"
import { CompanyRepository } from "@/modules/company/company.repository"
import { ServiceRepository } from "@/modules/service/service.repository"
import { MercadoPagoPaymentGateway } from "@/modules/payment/refund.gateway"
import { SubscriptionService } from "@/modules/subscription/subscription.service"
import { ValidationError } from "@/shared/errors"
import { UserData } from "@/types"

describe("PaymentService.createPreference", () => {
    const companyId = new Types.ObjectId()
    const serviceId = new Types.ObjectId()
    const pendingId = new Types.ObjectId().toString()

    let companyRepository: Record<string, ReturnType<typeof vi.fn>>
    let serviceRepository: Record<string, ReturnType<typeof vi.fn>>
    let paymentGateway: Record<string, ReturnType<typeof vi.fn>>
    let paymentService: PaymentService
    let markPending: ReturnType<typeof vi.fn>
    let removePending: ReturnType<typeof vi.fn>

    const user: UserData = {
        name: "Ana",
        lastName: "Gómez",
        email: "ana@example.com",
        dni: "30111222",
        phone: "1122334455",
    }

    /** Dentro de la ventana de visibilidad de la agenda. */
    const futureDate = () => {
        const date = new Date(Date.now() + 48 * 60 * 60 * 1000)
        const pad = (n: number) => String(n).padStart(2, "0")
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
            date.getDate()
        )} ${pad(date.getHours())}:${pad(date.getMinutes())}`
    }

    beforeEach(() => {
        companyRepository = {
            findById: vi.fn().mockResolvedValue({
                _id: companyId,
                mp_access_token: "token",
                bookingAnticipationHours: 0,
            }),
        }
        serviceRepository = {
            findById: vi.fn().mockResolvedValue({
                _id: serviceId,
                companyId,
                title: "Corte",
                price: 10000,
                signPrice: 3000,
                active: true,
            }),
        }
        paymentGateway = {
            createPreference: vi.fn().mockResolvedValue({ init_point: "https://mp/pay" }),
        }
        const mpTokenService = {
            withValidAccessToken: vi.fn(
                async (
                    company: { mp_access_token: string },
                    execute: (token: string) => Promise<{ unauthorized: boolean; result: unknown }>
                ) => {
                    const outcome = await execute(company.mp_access_token)
                    return outcome.result
                }
            ),
            persistTokens: vi.fn(),
            clearConnection: vi.fn(),
        }
        markPending = vi.fn().mockResolvedValue(pendingId)
        removePending = vi.fn()

        paymentService = new PaymentService(
            companyRepository as unknown as CompanyRepository,
            serviceRepository as unknown as ServiceRepository,
            paymentGateway as unknown as MercadoPagoPaymentGateway,
            {} as unknown as SubscriptionService,
            { findByCompanyId: vi.fn() } as never,
            mpTokenService as never
        )
    })

    const callCreatePreference = (extra: Record<string, unknown> = {}) =>
        paymentService.createPreference(
            companyId.toString(),
            user,
            {
                serviceId: serviceId.toString(),
                date: futureDate(),
                ...extra,
            } as never,
            markPending as never,
            removePending as never
        )

    it("cobra el precio del servicio y no el que envía el cliente", async () => {
        await callCreatePreference({ price: 1, title: "Seña de $1" })

        const body = paymentGateway.createPreference.mock.calls[0][1]
        expect(body.items[0].unit_price).toBe(3000)
        expect(body.items[0].title).toBe("Seña de turno para Corte")
    })

    it("usa el id de la reserva como referencia externa", async () => {
        await callCreatePreference()

        const body = paymentGateway.createPreference.mock.calls[0][1]
        expect(body.external_reference).toBe(pendingId)
    })

    it("incluye notification_url desde el entorno", async () => {
        await callCreatePreference()

        const body = paymentGateway.createPreference.mock.calls[0][1]
        expect(body.notification_url).toBe(
            process.env.NOTIFICATION_URL_MP ||
                "http://localhost:5000/mercadopago/webhooks"
        )
    })

    it("guarda los datos del cliente en la reserva temporal", async () => {
        await callCreatePreference()

        expect(markPending).toHaveBeenCalledWith(
            serviceId.toString(),
            expect.any(Date),
            expect.any(String),
            expect.objectContaining({ email: "ana@example.com", dni: "30111222" })
        )
    })

    it("falla sin cobrar si el horario ya no está disponible", async () => {
        markPending.mockResolvedValue(null)

        await expect(callCreatePreference()).rejects.toBeInstanceOf(ValidationError)
        expect(paymentGateway.createPreference).not.toHaveBeenCalled()
    })

    it("rechaza un servicio desactivado", async () => {
        serviceRepository.findById.mockResolvedValue({
            _id: serviceId,
            companyId,
            title: "Corte",
            signPrice: 3000,
            active: false,
        })

        await expect(callCreatePreference()).rejects.toBeInstanceOf(ValidationError)
        expect(markPending).not.toHaveBeenCalled()
    })

    it("rechaza si no se respeta la anticipación mínima de la empresa", async () => {
        companyRepository.findById.mockResolvedValue({
            _id: companyId,
            mp_access_token: "token",
            bookingAnticipationHours: 72,
        })

        await expect(callCreatePreference()).rejects.toBeInstanceOf(ValidationError)
        expect(markPending).not.toHaveBeenCalled()
    })
})
