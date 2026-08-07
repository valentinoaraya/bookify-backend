import { describe, it, expect, vi, beforeEach } from "vitest"
import { Types } from "mongoose"
import { ServiceService } from "@/modules/service/service.service"
import { ServiceRepository } from "@/modules/service/service.repository"
import { CompanyRepository } from "@/modules/company/company.repository"
import { PendingReservationRepository } from "@/modules/pending-reservation/pending-reservation.repository"
import { SlotRepository } from "@/modules/slot/slot.repository"
import { SubscriptionRepository } from "@/modules/subscription/subscription.repository"
import { NotFoundError, ValidationError } from "@/shared/errors"

describe("ServiceService.clearAvailableSlotsByDay", () => {
    const serviceId = new Types.ObjectId()
    const companyId = new Types.ObjectId()

    let serviceRepository: { findLeanById: ReturnType<typeof vi.fn> }
    let slotRepository: {
        clearAvailableInRange: ReturnType<typeof vi.fn>
        findAllByService: ReturnType<typeof vi.fn>
    }
    let pendingReservationRepository: {
        findActiveByService: ReturnType<typeof vi.fn>
    }
    let serviceService: ServiceService

    beforeEach(() => {
        serviceRepository = {
            findLeanById: vi.fn().mockResolvedValue({
                _id: serviceId,
                companyId,
                title: "Corte",
            }),
        }
        slotRepository = {
            clearAvailableInRange: vi.fn().mockResolvedValue({
                deleted: 5,
                trimmed: 1,
                keptWithHolds: 0,
            }),
            findAllByService: vi.fn().mockResolvedValue([]),
        }
        pendingReservationRepository = {
            findActiveByService: vi.fn().mockResolvedValue([]),
        }
        serviceService = new ServiceService(
            serviceRepository as unknown as ServiceRepository,
            {} as CompanyRepository,
            slotRepository as unknown as SlotRepository,
            {} as SubscriptionRepository,
            pendingReservationRepository as unknown as PendingReservationRepository
        )
    })

    it("limpia disponibles del día en timezone BA", async () => {
        const result = await serviceService.clearAvailableSlotsByDay(
            String(serviceId),
            "2030-01-15"
        )

        expect(slotRepository.clearAvailableInRange).toHaveBeenCalledWith(
            expect.objectContaining({
                serviceId: String(serviceId),
                excludeIds: [],
            })
        )
        const call = slotRepository.clearAvailableInRange.mock.calls[0][0]
        expect(call.toExclusive.getTime() - call.from.getTime()).toBe(
            24 * 60 * 60 * 1000
        )
        expect(result.summary).toEqual({
            date: "2030-01-15",
            deleted: 5,
            trimmed: 1,
            keptWithHolds: 0,
        })
    })

    it("excluye slots con hold activo", async () => {
        const holdSlotId = new Types.ObjectId()
        pendingReservationRepository.findActiveByService.mockResolvedValue([
            { slotId: holdSlotId },
        ])

        await serviceService.clearAvailableSlotsByDay(String(serviceId), "2030-01-15")

        expect(slotRepository.clearAvailableInRange).toHaveBeenCalledWith(
            expect.objectContaining({
                excludeIds: [holdSlotId],
            })
        )
    })

    it("falla con fecha inválida", async () => {
        await expect(
            serviceService.clearAvailableSlotsByDay(String(serviceId), "no-es-fecha")
        ).rejects.toBeInstanceOf(ValidationError)
    })

    it("falla si el servicio no existe", async () => {
        serviceRepository.findLeanById.mockResolvedValue(null)
        await expect(
            serviceService.clearAvailableSlotsByDay(String(serviceId), "2030-01-15")
        ).rejects.toBeInstanceOf(NotFoundError)
    })
})
