import { describe, it, expect, vi, beforeEach } from "vitest"
import { Types } from "mongoose"
import { ServiceService } from "@/modules/service/service.service"
import { ServiceRepository } from "@/modules/service/service.repository"
import { CompanyRepository } from "@/modules/company/company.repository"
import { PendingReservationRepository } from "@/modules/pending-reservation/pending-reservation.repository"
import { SlotRepository } from "@/modules/slot/slot.repository"
import { SubscriptionRepository } from "@/modules/subscription/subscription.repository"
import { NotFoundError, ValidationError } from "@/shared/errors"

describe("ServiceService.clearAvailableSlotsByDatetimes", () => {
    const serviceId = new Types.ObjectId()
    const companyId = new Types.ObjectId()

    let serviceRepository: { findLeanById: ReturnType<typeof vi.fn> }
    let slotRepository: {
        clearAvailableAtDatetimes: ReturnType<typeof vi.fn>
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
            clearAvailableAtDatetimes: vi.fn().mockResolvedValue({
                deleted: 2,
                trimmed: 1,
                keptWithHolds: 0,
                notFound: 0,
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

    it("limpia disponibles de los datetimes indicados", async () => {
        const result = await serviceService.clearAvailableSlotsByDatetimes(
            String(serviceId),
            ["2030-01-15 10:00", "2030-01-15 11:00", "2030-01-15 10:00"]
        )

        expect(slotRepository.clearAvailableAtDatetimes).toHaveBeenCalledWith(
            expect.objectContaining({
                serviceId: String(serviceId),
                excludeIds: [],
            })
        )
        const call = slotRepository.clearAvailableAtDatetimes.mock.calls[0][0]
        expect(call.datetimes).toHaveLength(2)
        expect(result.summary).toEqual({
            requested: 2,
            deleted: 2,
            trimmed: 1,
            keptWithHolds: 0,
            notFound: 0,
        })
    })

    it("falla si el servicio no existe", async () => {
        serviceRepository.findLeanById.mockResolvedValue(null)
        await expect(
            serviceService.clearAvailableSlotsByDatetimes(String(serviceId), [
                "2030-01-15 10:00",
            ])
        ).rejects.toBeInstanceOf(NotFoundError)
    })

    it("falla con datetime inválido", async () => {
        await expect(
            serviceService.clearAvailableSlotsByDatetimes(String(serviceId), [
                "fecha-mala",
            ])
        ).rejects.toBeInstanceOf(ValidationError)
    })
})
