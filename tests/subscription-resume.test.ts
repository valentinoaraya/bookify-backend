import { describe, it, expect, vi, beforeEach } from "vitest"
import { Types } from "mongoose"
import { SubscriptionService } from "@/modules/subscription/subscription.service"
import { CompanyRepository } from "@/modules/company/company.repository"
import { ServiceRepository } from "@/modules/service/service.repository"
import { MercadoPagoSubscriptionGateway } from "@/infrastructure/mercadopago/subscription.gateway"
import { SubscriptionRepository } from "@/modules/subscription/subscription.repository"
import { ValidationError } from "@/shared/errors"

vi.mock("mercadopago", () => ({
    PreApproval: class {
        update = vi.fn()
        get = vi.fn()
    },
}))

vi.mock("@/services/mercadopagoService", () => ({
    mercadoPagoAedes: {},
}))

describe("SubscriptionService resume y cleanup", () => {
    const companyId = new Types.ObjectId().toString()
    let subscriptionService: SubscriptionService
    let companyRepository: Record<string, ReturnType<typeof vi.fn>>
    let subscriptionRepository: Record<string, ReturnType<typeof vi.fn>>
    let mpGateway: {
        createPreApproval: ReturnType<typeof vi.fn>
        cancelPreApproval: ReturnType<typeof vi.fn>
    }

    beforeEach(() => {
        vi.clearAllMocks()
        companyRepository = {
            findById: vi.fn().mockResolvedValue({
                _id: companyId,
                email: "c@c.com",
                payer_email: "payer@c.com",
            }),
            updateById: vi.fn().mockResolvedValue({}),
            deleteById: vi.fn().mockResolvedValue({}),
        }
        subscriptionRepository = {
            findByCompanyId: vi.fn().mockResolvedValue({
                _id: new Types.ObjectId(),
                status: "pending",
                plan: "individual",
                mpPreapprovalId: "old-pre",
                companyId,
            }),
            updateStatus: vi.fn().mockResolvedValue({}),
            findPendingOlderThan: vi.fn().mockResolvedValue([]),
            deleteById: vi.fn().mockResolvedValue({}),
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
            {} as unknown as ServiceRepository,
            mpGateway as unknown as MercadoPagoSubscriptionGateway,
            subscriptionRepository as unknown as SubscriptionRepository
        )
    })

    it("resume pending cancela preapproval viejo y devuelve init_point", async () => {
        const result = await subscriptionService.resume(companyId)

        expect(mpGateway.cancelPreApproval).toHaveBeenCalledWith("old-pre")
        expect(mpGateway.createPreApproval).toHaveBeenCalled()
        expect(subscriptionRepository.updateStatus).toHaveBeenCalledWith(
            companyId,
            "pending",
            expect.objectContaining({ mpPreapprovalId: "new-pre" })
        )
        expect(result.init_point).toBe("https://mp.test/init")
    })

    it("resume rechaza si la suscripción está active", async () => {
        subscriptionRepository.findByCompanyId.mockResolvedValue({
            status: "active",
            plan: "individual",
            mpPreapprovalId: "pre",
        })

        await expect(subscriptionService.resume(companyId)).rejects.toBeInstanceOf(
            ValidationError
        )
        expect(mpGateway.createPreApproval).not.toHaveBeenCalled()
    })

    it("cleanupStalePending cancela MP y borra company + subscription", async () => {
        const subId = new Types.ObjectId()
        const coId = new Types.ObjectId()
        subscriptionRepository.findPendingOlderThan.mockResolvedValue([
            {
                _id: subId,
                companyId: coId,
                mpPreapprovalId: "stale-pre",
                status: "pending",
            },
        ])

        const result = await subscriptionService.cleanupStalePending(3)

        expect(mpGateway.cancelPreApproval).toHaveBeenCalledWith("stale-pre")
        expect(subscriptionRepository.deleteById).toHaveBeenCalledWith(subId)
        expect(companyRepository.deleteById).toHaveBeenCalledWith(coId)
        expect(result.cleaned).toBe(1)
    })

    it("cleanupStalePending no borra si no hay pending viejos", async () => {
        const result = await subscriptionService.cleanupStalePending(3)
        expect(result.cleaned).toBe(0)
        expect(companyRepository.deleteById).not.toHaveBeenCalled()
    })
})
