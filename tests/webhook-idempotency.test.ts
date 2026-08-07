import { describe, it, expect, vi, beforeEach } from "vitest"
import { Types } from "mongoose"
import { AppointmentService } from "@/modules/appointment/appointment.service"
import { AppointmentRepository } from "@/modules/appointment/appointment.repository"
import { ServiceRepository } from "@/modules/service/service.repository"
import { CompanyRepository } from "@/modules/company/company.repository"
import { NotificationService } from "@/modules/notification/notification.service"
import { PendingReservationService } from "@/modules/pending-reservation/pending-reservation.service"
import { MercadoPagoPaymentGateway } from "@/modules/payment/refund.gateway"
import { PaymentRepository } from "@/modules/payment/payment.repository"
import { SlotRepository } from "@/modules/slot/slot.repository"

vi.mock("@/shared/database/withTransaction", () => ({
    withTransaction: async (fn: (session: null) => Promise<unknown>) => fn(null),
}))

vi.mock("@/infrastructure/realtime/socket", () => ({
    getIO: () => ({ to: () => ({ emit: vi.fn() }) }),
}))

vi.mock("@/utils/scheduleRemindersForAppointment", () => ({
    scheduleRemindersForAppointment: vi.fn(),
}))

describe("AppointmentService webhook idempotency", () => {
    let appointmentService: AppointmentService
    let paymentRepository: Record<string, ReturnType<typeof vi.fn>>
    let paymentGateway: Record<string, ReturnType<typeof vi.fn>>
    let companyRepository: Record<string, ReturnType<typeof vi.fn>>
    let notificationService: Record<string, ReturnType<typeof vi.fn>>
    let createAppointmentSpy: ReturnType<typeof vi.spyOn>

    const companyId = new Types.ObjectId()
    const paymentDocId = new Types.ObjectId()
    const externalReference = `${companyId}_svc_2030-01-01T10:00:00_A_B_a@a.com_1_2_pend`

    beforeEach(() => {
        paymentRepository = {
            createIfAbsent: vi.fn(),
            linkAppointment: vi.fn(),
            updateStatus: vi.fn(),
            markRefunded: vi.fn(),
            findByMpPaymentId: vi.fn(),
            findById: vi.fn().mockResolvedValue(null),
        }
        paymentGateway = {
            refund: vi.fn().mockResolvedValue({ id: "refund-1" }),
            getPayment: vi.fn(),
            refundDetailed: vi.fn().mockResolvedValue({
                ok: true,
                data: { id: "refund-1" },
                unauthorized: false,
            }),
            getPaymentDetailed: vi.fn(),
        }
        companyRepository = {
            findOne: vi.fn().mockResolvedValue({
                _id: companyId,
                mp_access_token: "tok",
                name: "Co",
                email: "c@c.com",
                connectedWithMP: true,
            }),
            findById: vi.fn(),
        }
        notificationService = {
            sendConfirmAppointment: vi.fn(),
            sendRefundUnavailable: vi.fn(),
        }

        const mpTokenService = {
            getValidAccessToken: vi.fn(async (c: { mp_access_token?: string }) =>
                c.mp_access_token ?? null
            ),
            withValidAccessToken: vi.fn(
                async (
                    company: { mp_access_token?: string },
                    execute: (token: string) => Promise<{ unauthorized: boolean; result: unknown }>
                ) => {
                    const outcome = await execute(company.mp_access_token || "")
                    return outcome.result
                }
            ),
            refreshCompanyToken: vi.fn(),
            clearConnection: vi.fn(),
        }

        appointmentService = new AppointmentService(
            {
                createWithSession: vi.fn(),
                findLeanByIdPopulated: vi.fn(),
            } as unknown as AppointmentRepository,
            {
                findLeanById: vi.fn().mockResolvedValue({
                    _id: new Types.ObjectId(),
                    title: "Servicio",
                    active: true,
                    signPrice: 500,
                }),
            } as unknown as ServiceRepository,
            companyRepository as unknown as CompanyRepository,
            notificationService as unknown as NotificationService,
            {
                isAvailable: vi.fn().mockResolvedValue(true),
                deletePending: vi.fn(),
                notifyServiceUpdated: vi.fn(),
                // null fuerza el fallback al formato viejo de external_reference,
                // que es el que usan estos casos.
                getById: vi.fn().mockResolvedValue(null),
            } as unknown as PendingReservationService,
            paymentGateway as unknown as MercadoPagoPaymentGateway,
            {
                tryReserveByServiceDatetime: vi.fn(),
                findAllByService: vi.fn().mockResolvedValue([]),
            } as unknown as SlotRepository,
            paymentRepository as unknown as PaymentRepository,
            mpTokenService as never
        )

        createAppointmentSpy = vi
            .spyOn(appointmentService, "createAppointment")
            .mockResolvedValue({ companyId: companyId.toString() } as any)

        paymentGateway.getPaymentDetailed.mockResolvedValue({
            ok: true,
            unauthorized: false,
            data: {
                status: "approved",
                external_reference: externalReference,
                transaction_details: { total_paid_amount: 500 },
            },
        })
    })

    it("webhook duplicado payment.created no recrea Appointment", async () => {
        paymentRepository.createIfAbsent.mockResolvedValue({
            created: false,
            payment: {
                _id: paymentDocId,
                appointmentId: new Types.ObjectId(),
                status: "approved",
                amount: 500,
            },
        })

        const result = await appointmentService.confirmFromPaymentWebhook({
            type: "payment",
            action: "payment.created",
            user_id: "mp-user",
            data: { id: "mp-pay-1" },
        })

        expect(result.status).toBe(200)
        expect(result.body.data).toBe("Pago ya procesado.")
        expect(createAppointmentSpy).not.toHaveBeenCalled()
        expect(paymentGateway.refundDetailed).not.toHaveBeenCalled()
    })

    it("webhook nuevo crea Appointment una sola vez", async () => {
        paymentRepository.createIfAbsent.mockResolvedValue({
            created: true,
            payment: { _id: paymentDocId },
        })

        const result = await appointmentService.confirmFromPaymentWebhook({
            type: "payment",
            action: "payment.created",
            user_id: "mp-user",
            data: { id: "mp-pay-2" },
        })

        expect(result.status).toBe(200)
        expect(createAppointmentSpy).toHaveBeenCalledTimes(1)
        expect(paymentGateway.refundDetailed).not.toHaveBeenCalled()
    })

    it("payment.updated approved también confirma el turno", async () => {
        paymentRepository.createIfAbsent.mockResolvedValue({
            created: true,
            payment: { _id: paymentDocId },
        })

        const result = await appointmentService.confirmFromPaymentWebhook({
            type: "payment",
            action: "payment.updated",
            user_id: "mp-user",
            data: { id: "mp-pay-async" },
        })

        expect(result.status).toBe(200)
        expect(createAppointmentSpy).toHaveBeenCalledTimes(1)
    })

    it("si createAppointment falla tras createIfAbsent, reembolsa y no deja limbo", async () => {
        paymentRepository.createIfAbsent.mockResolvedValue({
            created: true,
            payment: { _id: paymentDocId, status: "approved", amount: 500 },
        })
        createAppointmentSpy.mockRejectedValue(new Error("Turno no disponible."))

        const result = await appointmentService.confirmFromPaymentWebhook({
            type: "payment",
            action: "payment.created",
            user_id: "mp-user",
            data: { id: "mp-pay-3" },
        })

        expect(result.status).toBe(200)
        expect(result.body.data).toMatch(/Reembolso procesado/)
        expect(paymentGateway.refundDetailed).toHaveBeenCalledWith("mp-pay-3", "tok", 500)
        expect(paymentRepository.markRefunded).toHaveBeenCalledWith(paymentDocId, 500)
        expect(notificationService.sendRefundUnavailable).toHaveBeenCalled()
    })

    it("reintento con pago approved sin appointment reembolsa (recupera limbo)", async () => {
        paymentRepository.createIfAbsent.mockResolvedValue({
            created: false,
            payment: {
                _id: paymentDocId,
                appointmentId: undefined,
                status: "approved",
                amount: 500,
            },
        })

        const result = await appointmentService.confirmFromPaymentWebhook({
            type: "payment",
            action: "payment.created",
            user_id: "mp-user",
            data: { id: "mp-pay-4" },
        })

        expect(result.status).toBe(200)
        expect(result.body.data).toMatch(/Reembolso procesado/)
        expect(createAppointmentSpy).not.toHaveBeenCalled()
        expect(paymentGateway.refundDetailed).toHaveBeenCalledWith("mp-pay-4", "tok", 500)
    })

    it("si el turno ya se vinculó y falla un side-effect, no reembolsa", async () => {
        paymentRepository.createIfAbsent.mockResolvedValue({
            created: true,
            payment: { _id: paymentDocId, status: "approved", amount: 500 },
        })
        createAppointmentSpy.mockRejectedValue(new Error("SMTP down"))
        paymentRepository.findById.mockResolvedValue({
            _id: paymentDocId,
            appointmentId: new Types.ObjectId(),
            status: "approved",
        })

        const result = await appointmentService.confirmFromPaymentWebhook({
            type: "payment",
            action: "payment.created",
            user_id: "mp-user",
            data: { id: "mp-pay-5" },
        })

        expect(result.status).toBe(200)
        expect(result.body.data).toBe("Pago procesado y turno confirmado.")
        expect(paymentGateway.refundDetailed).not.toHaveBeenCalled()
    })
})
