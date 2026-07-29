import { describe, it, expect, vi, beforeEach } from "vitest"
import { Types } from "mongoose"
import { SlotRepository } from "@/modules/slot/slot.repository"

describe("SlotRepository (unit)", () => {
    const serviceId = new Types.ObjectId()
    const datetime = new Date("2030-01-15T15:00:00.000Z")
    let findOneAndUpdate: ReturnType<typeof vi.fn>
    let repo: SlotRepository

    beforeEach(() => {
        findOneAndUpdate = vi.fn()
        repo = new SlotRepository()
        ;(repo as any).model = {
            findOneAndUpdate: (...args: unknown[]) => ({
                lean: () => ({
                    exec: () => findOneAndUpdate(...args),
                }),
            }),
        }
    })

    it("tryReserveByServiceDatetime usa filtro taken < capacity", async () => {
        findOneAndUpdate.mockResolvedValue({
            _id: new Types.ObjectId(),
            serviceId,
            datetime,
            capacity: 1,
            taken: 1,
        })

        const result = await repo.tryReserveByServiceDatetime(serviceId, datetime)

        expect(result?.taken).toBe(1)
        expect(findOneAndUpdate).toHaveBeenCalledWith(
            expect.objectContaining({
                serviceId,
                datetime,
                $expr: { $lt: ["$taken", "$capacity"] },
            }),
            expect.objectContaining({ $inc: { taken: 1 } }),
            expect.any(Object)
        )
    })

    it("segunda reserva falla cuando findOneAndUpdate retorna null", async () => {
        findOneAndUpdate
            .mockResolvedValueOnce({ _id: new Types.ObjectId(), taken: 1, capacity: 1 })
            .mockResolvedValueOnce(null)

        const first = await repo.tryReserveByServiceDatetime(serviceId, datetime)
        const second = await repo.tryReserveByServiceDatetime(serviceId, datetime)

        expect(first).not.toBeNull()
        expect(second).toBeNull()
    })
})
