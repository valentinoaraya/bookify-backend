import { describe, it, expect, vi, beforeEach } from "vitest"
import { Types } from "mongoose"
import { ServiceService } from "@/modules/service/service.service"
import { ServiceRepository } from "@/modules/service/service.repository"
import { CompanyRepository } from "@/modules/company/company.repository"
import { PendingReservationRepository } from "@/modules/pending-reservation/pending-reservation.repository"
import { SlotRepository } from "@/modules/slot/slot.repository"
import { SubscriptionRepository } from "@/modules/subscription/subscription.repository"
import { ForbiddenError, NotFoundError } from "@/shared/errors"

describe("ServiceService", () => {
    const companyId = new Types.ObjectId()
    let serviceRepository: {
        create: ReturnType<typeof vi.fn>
        findLeanById: ReturnType<typeof vi.fn>
        findById: ReturnType<typeof vi.fn>
    }
    let companyRepository: {
        findById: ReturnType<typeof vi.fn>
        updateById: ReturnType<typeof vi.fn>
    }
    let slotRepository: {
        findAllByService: ReturnType<typeof vi.fn>
        upsertMany: ReturnType<typeof vi.fn>
        deleteByService: ReturnType<typeof vi.fn>
    }
    let subscriptionRepository: {
        findByCompanyId: ReturnType<typeof vi.fn>
    }
    let pendingReservationRepository: Record<string, never>
    let serviceService: ServiceService

    beforeEach(() => {
        serviceRepository = {
            create: vi.fn(),
            findLeanById: vi.fn(),
            findById: vi.fn(),
        }
        companyRepository = {
            findById: vi.fn(),
            updateById: vi.fn(),
        }
        slotRepository = {
            findAllByService: vi.fn().mockResolvedValue([]),
            upsertMany: vi.fn(),
            deleteByService: vi.fn(),
        }
        subscriptionRepository = {
            findByCompanyId: vi.fn(),
        }
        pendingReservationRepository = {}
        serviceService = new ServiceService(
            serviceRepository as unknown as ServiceRepository,
            companyRepository as unknown as CompanyRepository,
            slotRepository as unknown as SlotRepository,
            subscriptionRepository as unknown as SubscriptionRepository,
            pendingReservationRepository as unknown as PendingReservationRepository
        )
    })

    it("bloquea crear servicio si el plan individual alcanzó el límite", async () => {
        companyRepository.findById.mockResolvedValue({
            _id: companyId,
            services: [1, 2, 3, 4, 5],
        })
        subscriptionRepository.findByCompanyId.mockResolvedValue({ plan: "individual" })

        await expect(
            serviceService.create(companyId, {
                title: "X",
                description: "Y",
                price: 100,
                capacityPerShift: 1,
                duration: 30,
                signPrice: 0,
                mode: "online",
            })
        ).rejects.toBeInstanceOf(ForbiddenError)
    })

    it("crea servicio y lo asocia a la empresa", async () => {
        companyRepository.findById.mockResolvedValue({
            _id: companyId,
            services: [],
        })
        subscriptionRepository.findByCompanyId.mockResolvedValue({ plan: "individual_plus" })
        const saved = { _id: new Types.ObjectId(), title: "Corte" }
        serviceRepository.create.mockResolvedValue(saved)
        companyRepository.updateById.mockResolvedValue({})

        const result = await serviceService.create(companyId, {
            title: "Corte",
            description: "Desc",
            price: 5000,
            capacityPerShift: 1,
            duration: 30,
            signPrice: 0,
            mode: "online",
        })

        expect(result).toBe(saved)
        expect(companyRepository.updateById).toHaveBeenCalled()
    })

    it("getById lanza NotFound", async () => {
        serviceRepository.findLeanById.mockResolvedValue(null)
        await expect(serviceService.getById("abc")).rejects.toBeInstanceOf(NotFoundError)
    })
})
