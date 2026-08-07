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
                        source: slot.source ?? "manual",
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

    /**
     * Inserta slots auto faltantes y actualiza capacity de auto existentes.
     * Nunca toca slots `manual` (si ya hay uno en ese datetime, se omite).
     */
    async syncAutoSlots(slots: SlotInput[]): Promise<{ inserted: number; updated: number }> {
        if (slots.length === 0) return { inserted: 0, updated: 0 }

        const serviceId = new Types.ObjectId(String(slots[0].serviceId))
        const datetimes = slots.map((s) => s.datetime)
        const existing = await this.model
            .find({ serviceId, datetime: { $in: datetimes } })
            .lean()
            .exec()

        const byTime = new Map(
            existing.map((s) => [new Date(s.datetime).getTime(), s])
        )

        const toInsert: SlotInput[] = []
        const toUpdateCapacity: Array<{ datetime: Date; capacity: number }> = []

        for (const slot of slots) {
            const key = slot.datetime.getTime()
            const found = byTime.get(key)
            if (!found) {
                toInsert.push({ ...slot, source: "auto", taken: 0 })
                continue
            }
            if ((found.source || "manual") === "manual") continue
            if (found.capacity !== slot.capacity && found.taken <= slot.capacity) {
                toUpdateCapacity.push({ datetime: slot.datetime, capacity: slot.capacity })
            }
        }

        let inserted = 0
        if (toInsert.length > 0) {
            const docs = toInsert.map((slot) => ({
                serviceId: new Types.ObjectId(String(slot.serviceId)),
                companyId: new Types.ObjectId(String(slot.companyId)),
                datetime: slot.datetime,
                capacity: slot.capacity,
                taken: 0,
                source: "auto" as const,
                createdAt: new Date(),
                updatedAt: new Date(),
            }))
            try {
                const result = await this.model.insertMany(docs, { ordered: false })
                inserted = result.length
            } catch (err: any) {
                // Duplicate key si otro proceso insertó en paralelo: contar insertados parciales
                inserted = err?.insertedDocs?.length ?? 0
                if (err?.code !== 11000 && !err?.writeErrors) throw err
            }
        }

        let updated = 0
        if (toUpdateCapacity.length > 0) {
            const ops = toUpdateCapacity.map(({ datetime, capacity }) => ({
                updateOne: {
                    filter: { serviceId, datetime, source: "auto" },
                    update: { $set: { capacity, updatedAt: new Date() } },
                },
            }))
            const result = await this.model.bulkWrite(ops as any, { ordered: false })
            updated = result.modifiedCount || 0
        }

        return { inserted, updated }
    }

    /**
     * Borra slots auto vacíos del servicio cuya datetime no esté en `keepDatetimes`
     * y/o esté fuera de [windowStart, windowEnd). Nunca borra taken > 0 ni excludeIds.
     */
    async deleteEmptyAutoSlotsNotMatching(params: {
        serviceId: string | Types.ObjectId
        keepDatetimes: Date[]
        windowStart: Date
        windowEnd: Date
        excludeIds?: Array<string | Types.ObjectId>
    }): Promise<number> {
        const keepSet = new Set(params.keepDatetimes.map((d) => d.getTime()))
        const exclude = (params.excludeIds || []).map((id) => new Types.ObjectId(String(id)))

        const candidates = await this.model
            .find({
                serviceId: params.serviceId,
                source: "auto",
                taken: 0,
                ...(exclude.length > 0 ? { _id: { $nin: exclude } } : {}),
            })
            .select({ _id: 1, datetime: 1 })
            .lean()
            .exec()

        const toDelete = candidates
            .filter((slot) => {
                const t = new Date(slot.datetime).getTime()
                const inWindow =
                    t >= params.windowStart.getTime() && t < params.windowEnd.getTime()
                if (!inWindow) return true
                return !keepSet.has(t)
            })
            .map((slot) => slot._id)

        if (toDelete.length === 0) return 0
        const result = await this.model.deleteMany({ _id: { $in: toDelete }, taken: 0 })
        return result.deletedCount || 0
    }

    async deleteEmptyFutureAutoSlots(
        serviceId: string | Types.ObjectId,
        from: Date,
        excludeIds: Array<string | Types.ObjectId> = []
    ): Promise<number> {
        const filter: Record<string, unknown> = {
            serviceId,
            source: "auto",
            taken: 0,
            datetime: { $gte: from },
        }
        if (excludeIds.length > 0) {
            filter._id = { $nin: excludeIds.map((id) => new Types.ObjectId(String(id))) }
        }
        const result = await this.model.deleteMany(filter)
        return result.deletedCount || 0
    }

    /**
     * Elimina disponibles en un rango: borra slots vacíos y baja capacity a taken
     * en slots parcialmente ocupados. No toca excludeIds (holds activos).
     */
    async clearAvailableInRange(params: {
        serviceId: string | Types.ObjectId
        from: Date
        toExclusive: Date
        excludeIds?: Array<string | Types.ObjectId>
    }): Promise<{ deleted: number; trimmed: number; keptWithHolds: number }> {
        const exclude = (params.excludeIds || []).map(
            (id) => new Types.ObjectId(String(id))
        )
        const excludeSet = new Set(exclude.map((id) => id.toString()))

        const slots = await this.model
            .find({
                serviceId: params.serviceId,
                datetime: { $gte: params.from, $lt: params.toExclusive },
            })
            .lean()
            .exec()

        const toDelete: Types.ObjectId[] = []
        const toTrim: Array<{ _id: Types.ObjectId; capacity: number }> = []
        let keptWithHolds = 0

        for (const slot of slots) {
            const id = slot._id as Types.ObjectId
            if (excludeSet.has(id.toString())) {
                keptWithHolds++
                continue
            }
            if (slot.taken === 0) {
                toDelete.push(id)
                continue
            }
            if (slot.capacity > slot.taken) {
                toTrim.push({ _id: id, capacity: slot.taken })
            }
        }

        let deleted = 0
        if (toDelete.length > 0) {
            const result = await this.model.deleteMany({ _id: { $in: toDelete } })
            deleted = result.deletedCount || 0
        }

        let trimmed = 0
        if (toTrim.length > 0) {
            const ops = toTrim.map(({ _id, capacity }) => ({
                updateOne: {
                    filter: { _id },
                    update: { $set: { capacity, updatedAt: new Date() } },
                },
            }))
            const result = await this.model.bulkWrite(ops as any, { ordered: false })
            trimmed = result.modifiedCount || 0
        }

        return { deleted, trimmed, keptWithHolds }
    }

    /**
     * Igual que clearAvailableInRange pero solo para datetimes concretos.
     */
    async clearAvailableAtDatetimes(params: {
        serviceId: string | Types.ObjectId
        datetimes: Date[]
        excludeIds?: Array<string | Types.ObjectId>
    }): Promise<{ deleted: number; trimmed: number; keptWithHolds: number; notFound: number }> {
        if (params.datetimes.length === 0) {
            return { deleted: 0, trimmed: 0, keptWithHolds: 0, notFound: 0 }
        }

        const exclude = (params.excludeIds || []).map(
            (id) => new Types.ObjectId(String(id))
        )
        const excludeSet = new Set(exclude.map((id) => id.toString()))

        const slots = await this.model
            .find({
                serviceId: params.serviceId,
                datetime: { $in: params.datetimes },
            })
            .lean()
            .exec()

        const foundTimes = new Set(slots.map((s) => new Date(s.datetime).getTime()))
        const notFound = params.datetimes.filter((d) => !foundTimes.has(d.getTime())).length

        const toDelete: Types.ObjectId[] = []
        const toTrim: Array<{ _id: Types.ObjectId; capacity: number }> = []
        let keptWithHolds = 0

        for (const slot of slots) {
            const id = slot._id as Types.ObjectId
            if (excludeSet.has(id.toString())) {
                keptWithHolds++
                continue
            }
            if (slot.taken === 0) {
                toDelete.push(id)
                continue
            }
            if (slot.capacity > slot.taken) {
                toTrim.push({ _id: id, capacity: slot.taken })
            }
        }

        let deleted = 0
        if (toDelete.length > 0) {
            const result = await this.model.deleteMany({ _id: { $in: toDelete } })
            deleted = result.deletedCount || 0
        }

        let trimmed = 0
        if (toTrim.length > 0) {
            const ops = toTrim.map(({ _id, capacity }) => ({
                updateOne: {
                    filter: { _id },
                    update: { $set: { capacity, updatedAt: new Date() } },
                },
            }))
            const result = await this.model.bulkWrite(ops as any, { ordered: false })
            trimmed = result.modifiedCount || 0
        }

        return { deleted, trimmed, keptWithHolds, notFound }
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
                        source: "manual",
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
