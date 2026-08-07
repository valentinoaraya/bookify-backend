import { describe, it, expect, vi, beforeEach } from "vitest"
import { Types } from "mongoose"
import { SubscriptionService } from "@/modules/subscription/subscription.service"
import { CompanyRepository } from "@/modules/company/company.repository"
import { ServiceRepository } from "@/modules/service/service.repository"
import { MercadoPagoSubscriptionGateway } from "@/infrastructure/mercadopago/subscription.gateway"
import { SubscriptionRepository } from "@/modules/subscription/subscription.repository"
import { ForbiddenError, ValidationError } from "@/shared/errors"

const preApprovalUpdate = vi.fn()
const preApprovalGet = vi.fn()

vi.mock("mercadopago", () => ({
    PreApproval: class {
        update = preApprovalUpdate
        get = preApprovalGet
    },
}))

vi.mock("@/services/mercadopagoService", () => ({
    mercadoPagoAedes: {},
}))

describe("SubscriptionService upgrade hardening", () => {
    let subscriptionService: SubscriptionService
    let subscriptionRepository: Record<string, ReturnType<typeof vi.fn>>
    let serviceRepository: Record<string, ReturnType<typeof vi.fn>>
    let companyRepository: Record<string, ReturnType<typeof vi.fn>>
    let applyBenefitsSpy: ReturnType<typeof vi.spyOn>
    let mpGateway: {
        createPreApproval: ReturnType<typeof vi.fn>
        cancelPreApproval: ReturnType<typeof vi.fn>
    }

    const companyId = new Types.ObjectId().toString()
    const subId = new Types.ObjectId()

    beforeEach(() => {
        vi.clearAllMocks()
        subscriptionRepository = {
            findByCompanyId: vi.fn().mockResolvedValue({
                _id: subId,
                status: "active",
                plan: "individual",
                mpPreapprovalId: "old-pre",
            }),
            updateStatus: vi.fn().mockResolvedValue({}),
            upsertForCompany: vi.fn().mockResolvedValue({}),
            updateById: vi.fn(),
            findByMpPreapprovalId: vi.fn(),
            beginTransition: vi.fn().mockResolvedValue({
                _id: subId,
                status: "upgrading",
                plan: "individual",
                pendingPlan: "individual_plus",
                mpPreapprovalId: "old-pre",
                previousPreapprovalId: "old-pre",
            }),
            clearTransitionFields: vi.fn().mockResolvedValue({}),
            claimAbortUpgrade: vi.fn().mockResolvedValue({
                status: "active",
                mpPreapprovalId: "old-pre",
            }),
            claimAbortFreeUpgrade: vi.fn().mockResolvedValue({
                status: "active",
            }),
            unsetMpPreapproval: vi.fn().mockResolvedValue({}),
            claimAuthorizedUpgrade: vi.fn().mockResolvedValue({
                status: "active",
                plan: "individual_plus",
                mpPreapprovalId: "new-pre",
            }),
            claimAuthorizedPending: vi.fn().mockResolvedValue({
                status: "active",
                mpPreapprovalId: "new-pre",
            }),
            claimResumeUpgradeSwap: vi.fn().mockResolvedValue({
                status: "upgrading",
                mpPreapprovalId: "new-pre-2",
            }),
            findUpgradingOlderThan: vi.fn().mockResolvedValue([]),
            findStaleByStatus: vi.fn().mockResolvedValue([]),
            findPendingOlderThan: vi.fn().mockResolvedValue([]),
            deleteById: vi.fn(),
        }
        serviceRepository = {
            findByCompany: vi.fn(),
            findByCompanySorted: vi.fn().mockResolvedValue([]),
            activateMany: vi.fn(),
            deactivateMany: vi.fn(),
            clearSignPricesByCompany: vi.fn(),
        }
        companyRepository = {
            findById: vi.fn().mockResolvedValue({
                _id: companyId,
                email: "c@c.com",
                payer_email: "payer@c.com",
            }),
            updateById: vi.fn(),
            deleteById: vi.fn(),
        }
        mpGateway = {
            createPreApproval: vi.fn().mockResolvedValue({
                id: "new-pre",
                init_point: "https://mp.test/init",
            }),
            cancelPreApproval: vi.fn().mockResolvedValue(undefined),
        }

        subscriptionService = new SubscriptionService(
            companyRepository as unknown as CompanyRepository,
            serviceRepository as unknown as ServiceRepository,
            mpGateway as unknown as MercadoPagoSubscriptionGateway,
            subscriptionRepository as unknown as SubscriptionRepository
        )

        applyBenefitsSpy = vi.spyOn(subscriptionService, "applyPlanBenefits")
        preApprovalUpdate.mockResolvedValue({
            status: "cancelled",
            auto_recurring: { transaction_amount: 12000 },
        })
    })

    it("upgrade NO cancela el preapproval viejo al iniciar", async () => {
        await subscriptionService.upgrade("old-pre", {
            newPlan: "individual_plus",
            payer_email: "p@p.com",
            companyId,
        })

        expect(mpGateway.cancelPreApproval).not.toHaveBeenCalled()
        expect(preApprovalUpdate).not.toHaveBeenCalled()
        expect(applyBenefitsSpy).not.toHaveBeenCalled()
        expect(subscriptionRepository.beginTransition).toHaveBeenCalledWith(
            companyId,
            "active",
            "upgrading",
            expect.objectContaining({
                pendingPlan: "individual_plus",
                previousPreapprovalId: "old-pre",
            })
        )
        expect(subscriptionRepository.updateStatus).toHaveBeenCalledWith(
            companyId,
            "upgrading",
            expect.objectContaining({
                mpPreapprovalId: "new-pre",
                pendingPlan: "individual_plus",
                previousPreapprovalId: "old-pre",
            })
        )
        // plan vigente NO se actualiza a individual_plus en updateStatus
        const updateCall = subscriptionRepository.updateStatus.mock.calls.find(
            (c) => c[1] === "upgrading" && c[2]?.mpPreapprovalId === "new-pre"
        )
        expect(updateCall?.[2]?.plan).toBeUndefined()
    })

    it("upgrade rechaza plan inferior o igual", async () => {
        await expect(
            subscriptionService.upgrade("old-pre", {
                newPlan: "individual",
                payer_email: "p@p.com",
                companyId,
            })
        ).rejects.toBeInstanceOf(ValidationError)
        expect(mpGateway.createPreApproval).not.toHaveBeenCalled()
    })

    it("upgrade rechaza team", async () => {
        await expect(
            subscriptionService.upgrade("old-pre", {
                newPlan: "team" as any,
                payer_email: "p@p.com",
                companyId,
            })
        ).rejects.toBeInstanceOf(ValidationError)
    })

    it("upgrade rechaza preapprovalId ajeno", async () => {
        await expect(
            subscriptionService.upgrade("other-pre", {
                newPlan: "individual_plus",
                payer_email: "p@p.com",
                companyId,
            })
        ).rejects.toBeInstanceOf(ForbiddenError)
    })

    it("beginTransition concurrente falla el segundo", async () => {
        subscriptionRepository.beginTransition.mockRejectedValue(
            new ValidationError(
                "Transición de suscripción inválida o concurrente: se esperaba active → upgrading"
            )
        )

        await expect(
            subscriptionService.upgrade("old-pre", {
                newPlan: "individual_plus",
                payer_email: "p@p.com",
                companyId,
            })
        ).rejects.toBeInstanceOf(ValidationError)
        expect(mpGateway.createPreApproval).not.toHaveBeenCalled()
    })

    it("webhook authorized aplica pendingPlan, cancela previous y beneficios", async () => {
        subscriptionRepository.findByCompanyId.mockResolvedValue({
            _id: subId,
            status: "upgrading",
            plan: "individual",
            pendingPlan: "individual_plus",
            mpPreapprovalId: "new-pre",
            previousPreapprovalId: "old-pre",
        })
        preApprovalGet.mockResolvedValue({
            id: "new-pre",
            status: "authorized",
            external_reference: companyId,
            next_payment_date: "2030-01-01",
        })
        applyBenefitsSpy.mockResolvedValue(undefined)

        await subscriptionService.handlePreapprovalWebhook("new-pre")

        expect(subscriptionRepository.claimAuthorizedUpgrade).toHaveBeenCalledWith(
            companyId,
            "new-pre",
            "individual_plus",
            "2030-01-01"
        )
        expect(mpGateway.cancelPreApproval).toHaveBeenCalledWith("old-pre")
        expect(applyBenefitsSpy).toHaveBeenCalledWith(companyId, "individual_plus")
    })

    it("authorized tardío tras abort se ignora y cancela el preapproval huérfano", async () => {
        subscriptionRepository.findByCompanyId.mockResolvedValue({
            _id: subId,
            status: "active",
            plan: "individual",
            mpPreapprovalId: "old-pre",
        })
        preApprovalGet.mockResolvedValue({
            id: "aborted-new-pre",
            status: "authorized",
            external_reference: companyId,
        })

        await subscriptionService.handlePreapprovalWebhook("aborted-new-pre")

        expect(subscriptionRepository.claimAuthorizedUpgrade).not.toHaveBeenCalled()
        expect(subscriptionRepository.upsertForCompany).not.toHaveBeenCalled()
        expect(applyBenefitsSpy).not.toHaveBeenCalled()
    })

    it("authorized upgrade que pierde el CAS cancela el nuevo preapproval", async () => {
        subscriptionRepository.findByCompanyId.mockResolvedValue({
            _id: subId,
            status: "upgrading",
            plan: "individual",
            pendingPlan: "individual_plus",
            mpPreapprovalId: "new-pre",
            previousPreapprovalId: "old-pre",
        })
        subscriptionRepository.claimAuthorizedUpgrade.mockResolvedValue(null)
        preApprovalGet.mockResolvedValue({
            id: "new-pre",
            status: "authorized",
            external_reference: companyId,
        })

        await subscriptionService.handlePreapprovalWebhook("new-pre")

        expect(mpGateway.cancelPreApproval).toHaveBeenCalledWith("new-pre")
        expect(applyBenefitsSpy).not.toHaveBeenCalled()
    })

    it("paused del preapproval nuevo durante upgrade restaura previous", async () => {
        subscriptionRepository.findByCompanyId.mockResolvedValue({
            _id: subId,
            status: "upgrading",
            plan: "individual",
            pendingPlan: "individual_plus",
            mpPreapprovalId: "new-pre",
            previousPreapprovalId: "old-pre",
        })
        preApprovalGet.mockResolvedValue({
            id: "new-pre",
            status: "paused",
            external_reference: companyId,
        })

        await subscriptionService.handlePreapprovalWebhook("new-pre")

        expect(subscriptionRepository.clearTransitionFields).toHaveBeenCalledWith(
            companyId,
            expect.objectContaining({
                status: "active",
                mpPreapprovalId: "old-pre",
            })
        )
        expect(subscriptionRepository.updateStatus).not.toHaveBeenCalledWith(
            companyId,
            "inactive"
        )
    })

    it("cancel del previousPreapprovalId durante upgrading se ignora", async () => {
        subscriptionRepository.findByCompanyId.mockResolvedValue({
            _id: subId,
            status: "upgrading",
            plan: "individual",
            pendingPlan: "individual_plus",
            mpPreapprovalId: "new-pre",
            previousPreapprovalId: "old-pre",
        })
        preApprovalGet.mockResolvedValue({
            id: "old-pre",
            status: "cancelled",
            external_reference: companyId,
        })

        const result = await subscriptionService.handlePreapprovalWebhook("old-pre")

        expect(result.status).toBe(200)
        expect(subscriptionRepository.clearTransitionFields).not.toHaveBeenCalled()
        expect(applyBenefitsSpy).not.toHaveBeenCalled()
    })

    it("cancel tras downgrade a free no marca inactive", async () => {
        subscriptionRepository.findByCompanyId.mockResolvedValue({
            _id: subId,
            status: "active",
            plan: "individual",
        })
        preApprovalGet.mockResolvedValue({
            id: "old-paid-pre",
            status: "cancelled",
            external_reference: companyId,
        })

        const result = await subscriptionService.handlePreapprovalWebhook(
            "old-paid-pre"
        )

        expect(result.status).toBe(200)
        expect(subscriptionRepository.updateStatus).not.toHaveBeenCalled()
    })

    it("cancel con preapproval vigente en plan pago sí marca inactive", async () => {
        subscriptionRepository.findByCompanyId.mockResolvedValue({
            _id: subId,
            status: "active",
            plan: "individual_plus",
            mpPreapprovalId: "paid-pre",
        })
        companyRepository.findById.mockResolvedValue({
            _id: companyId,
            email: "c@c.com",
        })
        preApprovalGet.mockResolvedValue({
            id: "paid-pre",
            status: "cancelled",
            external_reference: companyId,
        })

        await subscriptionService.handlePreapprovalWebhook("paid-pre")

        expect(subscriptionRepository.updateStatus).toHaveBeenCalledWith(
            companyId,
            "inactive"
        )
    })

    it("cancel del nuevo durante upgrading aborta y restaura previous", async () => {
        subscriptionRepository.findByCompanyId.mockResolvedValue({
            _id: subId,
            status: "upgrading",
            plan: "individual",
            pendingPlan: "individual_plus",
            mpPreapprovalId: "new-pre",
            previousPreapprovalId: "old-pre",
        })
        preApprovalGet.mockResolvedValue({
            id: "new-pre",
            status: "cancelled",
            external_reference: companyId,
        })

        await subscriptionService.handlePreapprovalWebhook("new-pre")

        expect(subscriptionRepository.clearTransitionFields).toHaveBeenCalledWith(
            companyId,
            expect.objectContaining({
                status: "active",
                mpPreapprovalId: "old-pre",
            })
        )
    })

    it("abortUpgrade restaura previous sin cambiar plan", async () => {
        subscriptionRepository.findByCompanyId.mockResolvedValue({
            _id: subId,
            status: "upgrading",
            plan: "individual",
            pendingPlan: "individual_plus",
            mpPreapprovalId: "new-pre",
            previousPreapprovalId: "old-pre",
        })

        const result = await subscriptionService.abortUpgrade(companyId)

        expect(subscriptionRepository.claimAbortUpgrade).toHaveBeenCalledWith(
            companyId,
            "new-pre",
            "old-pre"
        )
        expect(mpGateway.cancelPreApproval).toHaveBeenCalledWith("new-pre")
        expect(result.status).toBe("active")
    })

    it("resumeUpgrade crea nuevo checkout con pendingPlan", async () => {
        subscriptionRepository.findByCompanyId.mockResolvedValue({
            _id: subId,
            status: "upgrading",
            plan: "individual",
            pendingPlan: "individual_plus",
            mpPreapprovalId: "new-pre",
            previousPreapprovalId: "old-pre",
        })
        mpGateway.createPreApproval.mockResolvedValue({
            id: "new-pre-2",
            init_point: "https://mp.test/init",
        })

        const result = await subscriptionService.resumeUpgrade(companyId)

        expect(mpGateway.createPreApproval).toHaveBeenCalledWith(
            expect.objectContaining({ plan: "individual_plus" })
        )
        expect(subscriptionRepository.claimResumeUpgradeSwap).toHaveBeenCalledWith(
            companyId,
            "new-pre",
            "new-pre-2",
            "old-pre",
            "individual_plus"
        )
        expect(mpGateway.cancelPreApproval).toHaveBeenCalledWith("new-pre")
        expect(result.init_point).toBe("https://mp.test/init")
    })

    it("cleanupStaleTransitions aborta upgrading viejos", async () => {
        const abortSpy = vi.spyOn(subscriptionService, "abortUpgrade")
        abortSpy.mockResolvedValue({ status: "active" })
        subscriptionRepository.findUpgradingOlderThan.mockResolvedValue([
            { companyId, status: "upgrading" },
        ])
        subscriptionRepository.findStaleByStatus.mockResolvedValue([])

        const result = await subscriptionService.cleanupStaleTransitions(3)

        expect(abortSpy).toHaveBeenCalledWith(companyId)
        expect(result.abortedUpgrades).toBe(1)
    })

    it("upgrade desde plan free crea preapproval sin previous real", async () => {
        subscriptionRepository.findByCompanyId.mockResolvedValue({
            _id: subId,
            status: "active",
            plan: "individual",
        })

        await subscriptionService.upgrade("free", {
            newPlan: "individual_plus",
            payer_email: "p@p.com",
            companyId,
        })

        expect(subscriptionRepository.beginTransition).toHaveBeenCalledWith(
            companyId,
            "active",
            "upgrading",
            expect.objectContaining({
                pendingPlan: "individual_plus",
                previousPreapprovalId: "__free__",
            })
        )
        expect(mpGateway.createPreApproval).toHaveBeenCalled()
    })

    it("abortUpgrade desde free limpia el preapproval nuevo", async () => {
        subscriptionRepository.findByCompanyId.mockResolvedValue({
            _id: subId,
            status: "upgrading",
            plan: "individual",
            pendingPlan: "individual_plus",
            mpPreapprovalId: "new-pre",
            previousPreapprovalId: "__free__",
        })

        const result = await subscriptionService.abortUpgrade(companyId)

        expect(subscriptionRepository.claimAbortFreeUpgrade).toHaveBeenCalledWith(
            companyId,
            "new-pre"
        )
        expect(mpGateway.cancelPreApproval).toHaveBeenCalledWith("new-pre")
        expect(result.status).toBe("active")
    })

    it("authorized desde free no cancela previous marker", async () => {
        subscriptionRepository.findByCompanyId.mockResolvedValue({
            _id: subId,
            status: "upgrading",
            plan: "individual",
            pendingPlan: "individual_plus",
            mpPreapprovalId: "new-pre",
            previousPreapprovalId: "__free__",
        })
        preApprovalGet.mockResolvedValue({
            id: "new-pre",
            status: "authorized",
            external_reference: companyId,
            next_payment_date: "2030-01-01",
        })
        applyBenefitsSpy.mockResolvedValue(undefined)

        await subscriptionService.handlePreapprovalWebhook("new-pre")

        expect(mpGateway.cancelPreApproval).not.toHaveBeenCalled()
        expect(applyBenefitsSpy).toHaveBeenCalledWith(companyId, "individual_plus")
    })
})
