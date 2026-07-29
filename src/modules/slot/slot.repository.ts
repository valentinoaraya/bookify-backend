import { ClientSession, Types } from "mongoose"
import { BaseRepository } from "../../shared/base/base.repository"
import SlotModel from "./slot.model"
import { SessionOpts, SlotDocument, SlotInput } from "./slot.types"

export class SlotRepository extends BaseRepository<SlotDocument> {
    constructor() {
        super(SlotModel)
    }

    async findByServiceAndDatetime(
        serviceId: string | Types.ObjectId,
        datetime: Date
    ): Promise<SlotDocument | null> {
        return this.findOne({ serviceId, datetime })
    }

    async findAvailableByService(
        serviceId: string | Types.ObjectId,
        from?: Date,
        to?: Date
    ): Promise<SlotDocument[]> {
        const filter: Record<string, unknown> = {
            serviceId,
            $expr: { $lt: ["$taken", "$capacity"] },
        }
        if (from || to) {
            filter.datetime = {
                ...(from ? { $gte: from } : {}),
                ...(to ? { $lte: to } : {}),
            }
        }
        return this.model.find(filter).sort({ datetime: 1 }).lean().exec() as unknown as Promise<
            SlotDocument[]
        >
    }

    async findAllByService(
        serviceId: string | Types.ObjectId
    ): Promise<SlotDocument[]> {
        return this.model
            .find({ serviceId })
            .sort({ datetime: 1 })
            .lean()
            .exec() as unknown as Promise<SlotDocument[]>
    }

    async findAllByCompany(
        companyId: string | Types.ObjectId
    ): Promise<SlotDocument[]> {
        return this.model
            .find({ companyId })
            .sort({ datetime: 1 })
            .lean()
            .exec() as unknown as Promise<SlotDocument[]>
    }

    async findAllByServiceIds(
        serviceIds: Array<string | Types.ObjectId>
    ): Promise<SlotDocument[]> {
        if (serviceIds.length === 0) return []
        return this.model
            .find({ serviceId: { $in: serviceIds } })
            .sort({ datetime: 1 })
            .lean()
            .exec() as unknown as Promise<SlotDocument[]>
    }

    async upsertMany(slots: SlotInput[]): Promise<number> {
        if (slots.length === 0) return 0
        const ops = slots.map((slot) => ({
            updateOne: {
                filter: {
                    serviceId: new Types.ObjectId(String(slot.serviceId)),
                    datetime: slot.datetime,
                },
                update: {
                    $setOnInsert: {
                        serviceId: new Types.ObjectId(String(slot.serviceId)),
                        companyId: new Types.ObjectId(String(slot.companyId)),
                        datetime: slot.datetime,
                        taken: slot.taken ?? 0,
                        createdAt: new Date(),
                    },
                    $set: {
                        capacity: slot.capacity,
                        updatedAt: new Date(),
                    },
                },
                upsert: true,
            },
        }))
        const result = await this.model.bulkWrite(ops as any, { ordered: false })
        return (result.upsertedCount || 0) + (result.modifiedCount || 0)
    }

    async tryReserve(
        slotId: string | Types.ObjectId,
        opts: SessionOpts = {}
    ): Promise<SlotDocument | null> {
        return this.model
            .findOneAndUpdate(
                { _id: slotId, $expr: { $lt: ["$taken", "$capacity"] } },
                { $inc: { taken: 1 }, $set: { updatedAt: new Date() } },
                { new: true, session: opts.session }
            )
            .lean()
            .exec() as unknown as Promise<SlotDocument | null>
    }

    async tryReserveByServiceDatetime(
        serviceId: string | Types.ObjectId,
        datetime: Date,
        opts: SessionOpts = {}
    ): Promise<SlotDocument | null> {
        return this.model
            .findOneAndUpdate(
                {
                    serviceId,
                    datetime,
                    $expr: { $lt: ["$taken", "$capacity"] },
                },
                { $inc: { taken: 1 }, $set: { updatedAt: new Date() } },
                { new: true, session: opts.session }
            )
            .lean()
            .exec() as unknown as Promise<SlotDocument | null>
    }

    async releaseOne(
        slotId: string | Types.ObjectId,
        opts: SessionOpts = {}
    ): Promise<SlotDocument | null> {
        return this.model
            .findOneAndUpdate(
                { _id: slotId, taken: { $gt: 0 } },
                { $inc: { taken: -1 }, $set: { updatedAt: new Date() } },
                { new: true, session: opts.session }
            )
            .lean()
            .exec() as unknown as Promise<SlotDocument | null>
    }

    async releaseByServiceDatetime(
        serviceId: string | Types.ObjectId,
        datetime: Date,
        opts: SessionOpts = {}
    ): Promise<SlotDocument | null> {
        return this.model
            .findOneAndUpdate(
                { serviceId, datetime, taken: { $gt: 0 } },
                { $inc: { taken: -1 }, $set: { updatedAt: new Date() } },
                { new: true, session: opts.session }
            )
            .lean()
            .exec() as unknown as Promise<SlotDocument | null>
    }

    async adjustCapacity(
        slotId: string | Types.ObjectId,
        capacity: number
    ): Promise<SlotDocument | null> {
        return this.model
            .findByIdAndUpdate(
                slotId,
                { $set: { capacity, updatedAt: new Date() } },
                { new: true }
            )
            .lean()
            .exec() as unknown as Promise<SlotDocument | null>
    }

    async incrementCapacity(
        serviceId: string | Types.ObjectId,
        datetime: Date,
        companyId: Types.ObjectId | string,
        by = 1
    ): Promise<SlotDocument | null> {
        return this.model
            .findOneAndUpdate(
                { serviceId, datetime },
                {
                    $inc: { capacity: by },
                    $set: { updatedAt: new Date() },
                    $setOnInsert: {
                        serviceId,
                        companyId,
                        datetime,
                        taken: 0,
                        createdAt: new Date(),
                    },
                },
                { new: true, upsert: true }
            )
            .lean()
            .exec() as unknown as Promise<SlotDocument | null>
    }

    async decrementCapacityOrDelete(
        serviceId: string | Types.ObjectId,
        datetime: Date,
        all = false
    ): Promise<SlotDocument | null> {
        const slot = await this.findByServiceAndDatetime(serviceId, datetime)
        if (!slot) return null

        if (all || slot.capacity - 1 <= slot.taken) {
            if (all || slot.taken === 0) {
                await this.model.deleteOne({ _id: slot._id })
                return { ...slot, capacity: all ? 0 : slot.capacity - 1 } as SlotDocument
            }
            // capacity would equal taken — remove from "available" by setting capacity = taken
            return this.adjustCapacity(slot._id, slot.taken)
        }

        return this.adjustCapacity(slot._id, slot.capacity - 1)
    }

    async setCapacityForService(serviceId: string | Types.ObjectId, capacity: number) {
        await this.model.updateMany(
            { serviceId },
            { $set: { capacity, updatedAt: new Date() } }
        )
    }

    async deletePastEmpty(before: Date): Promise<number> {
        const result = await this.model.deleteMany({
            datetime: { $lt: before },
            taken: 0,
        })
        return result.deletedCount || 0
    }

    async deleteByService(serviceId: string | Types.ObjectId): Promise<void> {
        await this.model.deleteMany({ serviceId })
    }

    async createWithSession(
        data: Partial<SlotDocument>,
        session?: ClientSession
    ): Promise<SlotDocument> {
        const docs = await this.model.create([data], { session })
        return docs[0]
    }
}
