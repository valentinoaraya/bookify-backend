import { describe, it, expect, vi, beforeEach } from "vitest"
import { Types } from "mongoose"
import { CompanyService } from "@/modules/company/company.service"
import { CompanyRepository } from "@/modules/company/company.repository"
import { AuthService } from "@/modules/auth/auth.service"
import { MercadoPagoSubscriptionGateway } from "@/infrastructure/mercadopago/subscription.gateway"
import { SubscriptionRepository } from "@/modules/subscription/subscription.repository"
import { AppointmentRepository } from "@/modules/appointment/appointment.repository"
import { SlotRepository } from "@/modules/slot/slot.repository"
import { PendingReservationRepository } from "@/modules/pending-reservation/pending-reservation.repository"
import { ValidationError, NotFoundError } from "@/shared/errors"

describe("CompanyService", () => {
    const companyId = new Types.ObjectId()
    let companyRepository: {
        findByEmail: ReturnType<typeof vi.fn>
        create: ReturnType<typeof vi.fn>
        deleteById: ReturnType<typeof vi.fn>
        findPanelById: ReturnType<typeof vi.fn>
        findCompanyIdInUse: ReturnType<typeof vi.fn>
        updateCompanyFields: ReturnType<typeof vi.fn>
        findByCompanyId: ReturnType<typeof vi.fn>
    }
    let authService: {
        parseEmail: ReturnType<typeof vi.fn>
        assertPasswordFormat: ReturnType<typeof vi.fn>
        hashPassword: ReturnType<typeof vi.fn>
        createTokens: ReturnType<typeof vi.fn>
    }
    let mpGateway: {
        createPreApproval: ReturnType<typeof vi.fn>
        cancelPreApproval: ReturnType<typeof vi.fn>
    }
    let subscriptionRepository: {
        createForCompany: ReturnType<typeof vi.fn>
        deleteById: ReturnType<typeof vi.fn>
    }
    let appointmentRepository: {
        findScheduledByCompany: ReturnType<typeof vi.fn>
    }
    let slotRepository: {
        findAllByServiceIds: ReturnType<typeof vi.fn>
    }
    let pendingReservationRepository: {
        findActiveByServiceIds: ReturnType<typeof vi.fn>
    }
    let companyService: CompanyService

    beforeEach(() => {
        companyRepository = {
            findByEmail: vi.fn(),
            create: vi.fn(),
            deleteById: vi.fn(),
            findPanelById: vi.fn(),
            findCompanyIdInUse: vi.fn(),
            updateCompanyFields: vi.fn(),
            findByCompanyId: vi.fn(),
        }
        authService = {
            parseEmail: vi.fn((e: string) => e.toLowerCase()),
            assertPasswordFormat: vi.fn(),
            hashPassword: vi.fn().mockResolvedValue("hashed"),
            createTokens: vi.fn().mockReturnValue({
                access_token: "access",
                refresh_token: "refresh",
            }),
        }
        mpGateway = {
            createPreApproval: vi.fn(),
            cancelPreApproval: vi.fn().mockResolvedValue(undefined),
        }
        subscriptionRepository = {
            createForCompany: vi.fn(),
            deleteById: vi.fn(),
        }
        appointmentRepository = {
            findScheduledByCompany: vi.fn().mockResolvedValue([]),
        }
        slotRepository = {
            findAllByServiceIds: vi.fn().mockResolvedValue([]),
        }
        pendingReservationRepository = {
            findActiveByServiceIds: vi.fn().mockResolvedValue([]),
        }
        companyService = new CompanyService(
            companyRepository as unknown as CompanyRepository,
            authService as unknown as AuthService,
            mpGateway as unknown as MercadoPagoSubscriptionGateway,
            subscriptionRepository as unknown as SubscriptionRepository,
            appointmentRepository as unknown as AppointmentRepository,
            slotRepository as unknown as SlotRepository,
            pendingReservationRepository as unknown as PendingReservationRepository
        )
    })

    describe("update", () => {
        it("rechaza company_id duplicado", async () => {
            companyRepository.findCompanyIdInUse.mockResolvedValue(true)

            await expect(
                companyService.update(companyId, { company_id: "taken-slug" })
            ).rejects.toBeInstanceOf(ValidationError)
        })

        it("actualiza y mapea la respuesta", async () => {
            companyRepository.findCompanyIdInUse.mockResolvedValue(false)
            companyRepository.updateCompanyFields.mockResolvedValue({
                name: "Nueva",
                company_id: "slug",
                email: "a@b.com",
                phone: "123",
                city: "CABA",
                street: "Calle",
                number: "1",
                reminders: [],
                slotsVisibilityDays: 7,
                cancellationAnticipationHours: 24,
                bookingAnticipationHours: 1,
            })

            const result = await companyService.update(companyId, { name: "Nueva" })
            expect(result.type).toBe("company")
            expect(result.name).toBe("Nueva")
        })
    })

    describe("getPanel", () => {
        it("lanza NotFound si no existe", async () => {
            companyRepository.findPanelById.mockResolvedValue(null)
            await expect(companyService.getPanel(companyId)).rejects.toBeInstanceOf(
                NotFoundError
            )
        })
    })

    describe("register", () => {
        const paidRegisterInput = {
            name: "Co",
            email: "a@b.com",
            password: "secret1",
            phone: "123",
            plan: "individual_plus" as const,
            payer_email: "payer@b.com",
            province: "Buenos Aires",
            city: "La Plata",
            street: "Calle",
            number: "100",
        }

        const freeRegisterInput = {
            ...paidRegisterInput,
            plan: "individual" as const,
            payer_email: undefined,
        }

        it("registra plan free sin Mercado Pago y deja la suscripción active", async () => {
            companyRepository.findByEmail.mockResolvedValue(null)
            const savedId = new Types.ObjectId()
            const save = vi.fn()
            companyRepository.create.mockResolvedValue({
                _id: savedId,
                id: savedId.toString(),
                name: "Co",
                email: "a@b.com",
                save,
            })
            const subId = new Types.ObjectId()
            subscriptionRepository.createForCompany.mockResolvedValue({
                _id: subId,
            })

            const result = await companyService.register(freeRegisterInput)

            expect(mpGateway.createPreApproval).not.toHaveBeenCalled()
            expect(subscriptionRepository.createForCompany).toHaveBeenCalledWith(
                expect.objectContaining({
                    plan: "individual",
                    status: "active",
                })
            )
            expect(result.requiresPayment).toBe(false)
            expect(result.init_point).toBeUndefined()
            expect(result.access_token).toBe("access")
        })

        it("hace rollback si falla PreApproval", async () => {
            companyRepository.findByEmail.mockResolvedValue(null)
            const savedId = new Types.ObjectId()
            companyRepository.create.mockResolvedValue({
                _id: savedId,
                id: savedId.toString(),
                name: "Co",
                email: "a@b.com",
                save: vi.fn(),
            })
            mpGateway.createPreApproval.mockRejectedValue(new Error("MP down"))

            await expect(companyService.register(paidRegisterInput)).rejects.toThrow("MP down")

            expect(companyRepository.deleteById).toHaveBeenCalledWith(savedId)
            expect(mpGateway.cancelPreApproval).not.toHaveBeenCalled()
        })

        it("cancela preapproval y hace rollback si falta init_point", async () => {
            companyRepository.findByEmail.mockResolvedValue(null)
            const savedId = new Types.ObjectId()
            companyRepository.create.mockResolvedValue({
                _id: savedId,
                id: savedId.toString(),
                name: "Co",
                email: "a@b.com",
                save: vi.fn(),
            })
            mpGateway.createPreApproval.mockResolvedValue({
                id: "pre-1",
                init_point: undefined,
            })

            await expect(companyService.register(paidRegisterInput)).rejects.toBeInstanceOf(
                ValidationError
            )

            expect(mpGateway.cancelPreApproval).toHaveBeenCalledWith("pre-1")
            expect(companyRepository.deleteById).toHaveBeenCalledWith(savedId)
        })

        it("cancela preapproval si falla create de subscription", async () => {
            companyRepository.findByEmail.mockResolvedValue(null)
            const savedId = new Types.ObjectId()
            companyRepository.create.mockResolvedValue({
                _id: savedId,
                id: savedId.toString(),
                name: "Co",
                email: "a@b.com",
                save: vi.fn(),
            })
            mpGateway.createPreApproval.mockResolvedValue({
                id: "pre-2",
                init_point: "https://mp.test/checkout",
            })
            subscriptionRepository.createForCompany.mockRejectedValue(
                new Error("DB fail")
            )

            await expect(companyService.register(paidRegisterInput)).rejects.toThrow("DB fail")

            expect(mpGateway.cancelPreApproval).toHaveBeenCalledWith("pre-2")
            expect(companyRepository.deleteById).toHaveBeenCalledWith(savedId)
        })
    })
})
