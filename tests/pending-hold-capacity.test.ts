import { describe, it, expect, vi, beforeEach } from "vitest"
import { Types } from "mongoose"
import { PendingReservationService } from "@/modules/pending-reservation/pending-reservation.service"
import { PendingReservationRepository } from "@/modules/pending-reservation/pending-reservation.repository"
import { SlotRepository } from "@/modules/slot/slot.repository"
import { ServiceRepository } from "@/modules/service/service.repository"

vi.mock("@/infrastructure/realtime/socket", () => ({
    getIO: () => ({ to: () => ({ emit: vi.fn() }) }),
}))

describe("PendingReservationService hold capacity", () => {
    const slotId = new Types.ObjectId()
    const serviceId = new Types.ObjectId()
    const companyId = new Types.ObjectId()

    let pendingRepo: Record<string, ReturnType<typeof vi.fn>>
    let slotRepo: Record<string, ReturnType<typeof vi.fn>>
    let service: PendingReservationService

    beforeEach(() => {
        pendingRepo = {
            findBySlotAndUser: vi.fn().mockResolvedValue(null),
            renewActiveHold: vi.fn(),
            upsertAcquiringHold: vi.fn(),
            claimHoldIfWithinCapacity: vi.fn(),
            expireHold: vi.fn(),
            countActiveBySlot: vi.fn(),
            findActiveByService: vi.fn().mockResolvedValue([]),
        }
        slotRepo = {
            findByServiceAndDatetime: vi.fn().mockResolvedValue({
                _id: slotId,
                serviceId,
                companyId,
                taken: 0,
                capacity: 1,
            }),
            findById: vi.fn().mockResolvedValue({
                _id: slotId,
                serviceId,
                companyId,
                taken: 0,
                capacity: 1,
            }),
            findAllByService: vi.fn().mockResolvedValue([]),
        }

        service = new PendingReservationService(
            pendingRepo as unknown as PendingReservationRepository,
            slotRepo as unknown as SlotRepository,
            {
                findLeanById: vi.fn().mockResolvedValue(null),
            } as unknown as ServiceRepository
        )
    })

    it("renueva hold activo sin volver a competir por cupo", async () => {
        const existingId = new Types.ObjectId()
        pendingRepo.findBySlotAndUser.mockResolvedValue({
            _id: existingId,
            holdUntil: new Date(Date.now() + 60_000),
        })
        pendingRepo.renewActiveHold.mockResolvedValue({ _id: existingId })

        const result = await service.markAsPending(
            serviceId.toString(),
            new Date(),
            "user_a",
            {
                name: "A",
                lastName: "A",
                email: "a@a.com",
                dni: "1",
                phone: "1",
            }
        )

        expect(result).toBe(existingId.toString())
        expect(pendingRepo.upsertAcquiringHold).not.toHaveBeenCalled()
        expect(pendingRepo.claimHoldIfWithinCapacity).not.toHaveBeenCalled()
        expect(pendingRepo.renewActiveHold).toHaveBeenCalled()
    })

    it("si el claim pierde la capacidad, no devuelve pendingId", async () => {
        const pendingId = new Types.ObjectId()
        pendingRepo.upsertAcquiringHold.mockResolvedValue({ _id: pendingId })
        pendingRepo.claimHoldIfWithinCapacity.mockResolvedValue(false)

        const result = await service.markAsPending(
            serviceId.toString(),
            new Date(),
            "user_b",
            {
                name: "B",
                lastName: "B",
                email: "b@b.com",
                dni: "2",
                phone: "2",
            }
        )

        expect(result).toBeNull()
        expect(pendingRepo.claimHoldIfWithinCapacity).toHaveBeenCalledWith(
            pendingId,
            slotId,
            1
        )
    })

    it("si el claim gana, devuelve el pendingId", async () => {
        const pendingId = new Types.ObjectId()
        pendingRepo.upsertAcquiringHold.mockResolvedValue({ _id: pendingId })
        pendingRepo.claimHoldIfWithinCapacity.mockResolvedValue(true)

        const result = await service.markAsPending(
            serviceId.toString(),
            new Date(),
            "user_c",
            {
                name: "C",
                lastName: "C",
                email: "c@c.com",
                dni: "3",
                phone: "3",
            }
        )

        expect(result).toBe(pendingId.toString())
    })

    it("allowed considera taken: capacity 2 con taken 1 deja 1 hold", async () => {
        slotRepo.findByServiceAndDatetime.mockResolvedValue({
            _id: slotId,
            serviceId,
            companyId,
            taken: 1,
            capacity: 2,
        })
        slotRepo.findById.mockResolvedValue({
            _id: slotId,
            serviceId,
            companyId,
            taken: 1,
            capacity: 2,
        })
        const pendingId = new Types.ObjectId()
        pendingRepo.upsertAcquiringHold.mockResolvedValue({ _id: pendingId })
        pendingRepo.claimHoldIfWithinCapacity.mockResolvedValue(true)

        await service.markAsPending(
            serviceId.toString(),
            new Date(),
            "user_d",
            {
                name: "D",
                lastName: "D",
                email: "d@d.com",
                dni: "4",
                phone: "4",
            }
        )

        expect(pendingRepo.claimHoldIfWithinCapacity).toHaveBeenCalledWith(
            pendingId,
            slotId,
            1
        )
    })
})

describe("PendingReservationRepository.claimHoldIfWithinCapacity", () => {
    it("expira al perdedor cuando hay más holds que cupo", async () => {
        const slotId = new Types.ObjectId()
        const winnerId = new Types.ObjectId()
        const loserId = new Types.ObjectId()

        const repo = new PendingReservationRepository()
        const findOrdered = vi
            .spyOn(repo, "findActiveBySlotOrdered")
            .mockResolvedValue([
                { _id: winnerId, holdAcquiredAt: new Date(1) },
                { _id: loserId, holdAcquiredAt: new Date(2) },
            ] as any)
        const expire = vi.spyOn(repo, "expireHold").mockResolvedValue(null)

        const won = await repo.claimHoldIfWithinCapacity(winnerId, slotId, 1)
        const lost = await repo.claimHoldIfWithinCapacity(loserId, slotId, 1)

        expect(won).toBe(true)
        expect(lost).toBe(false)
        expect(expire).toHaveBeenCalledWith(loserId)
        expect(expire).not.toHaveBeenCalledWith(winnerId)
        findOrdered.mockRestore()
        expire.mockRestore()
    })
})
