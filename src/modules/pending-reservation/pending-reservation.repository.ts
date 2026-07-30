import { ClientSession, Types } from "mongoose"
import { BaseRepository } from "../../shared/base/base.repository"
import PendingReservationModel from "./pending-reservation.model"
import {
    PendingReservationDocument,
    PendingReservationInput,
} from "./pending-reservation.types"

type SessionOpts = { session?: ClientSession | null }

export class PendingReservationRepository extends BaseRepository<PendingReservationDocument> {
    constructor() {
        super(PendingReservationModel)
    }

    async findBySlotAndUser(
        slotId: string | Types.ObjectId,
        userKey: string
    ): Promise<PendingReservationDocument | null> {
        return this.model
            .findOne({ slotId, userKey })
            .lean()
            .exec() as unknown as Promise<PendingReservationDocument | null>
    }

    /**
     * Renueva un hold ya activo (mismo usuario): no cambia holdAcquiredAt ni
     * compite de nuevo por cupo.
     */
    async renewActiveHold(
        pendingId: string | Types.ObjectId,
        data: Pick<
            PendingReservationInput,
            "userData" | "holdUntil" | "expiresAt" | "preferenceExternalRef"
        >
    ): Promise<PendingReservationDocument | null> {
        return this.model
            .findOneAndUpdate(
                {
                    _id: pendingId,
                    holdUntil: { $gt: new Date() },
                },
                {
                    $set: {
                        userData: data.userData,
                        holdUntil: data.holdUntil,
                        expiresAt: data.expiresAt,
                        preferenceExternalRef: data.preferenceExternalRef,
                        updatedAt: new Date(),
                    },
                },
                { new: true }
            )
            .lean()
            .exec() as unknown as Promise<PendingReservationDocument | null>
    }

    /**
     * Upsert que (re)adquiere cupo: siempre setea holdAcquiredAt = ahora.
     * Usar solo cuando el usuario no tenía hold activo.
     */
    async upsertAcquiringHold(
        data: PendingReservationInput
    ): Promise<PendingReservationDocument> {
        const slotId = new Types.ObjectId(String(data.slotId))
        const now = new Date()
        const holdAcquiredAt = data.holdAcquiredAt ?? now

        return this.model
            .findOneAndUpdate(
                { slotId, userKey: data.userKey },
                {
                    $set: {
                        serviceId: new Types.ObjectId(String(data.serviceId)),
                        companyId: new Types.ObjectId(String(data.companyId)),
                        userData: data.userData,
                        holdUntil: data.holdUntil,
                        expiresAt: data.expiresAt,
                        holdAcquiredAt,
                        preferenceExternalRef: data.preferenceExternalRef,
                        updatedAt: now,
                    },
                    $setOnInsert: {
                        slotId,
                        userKey: data.userKey,
                        createdAt: now,
                    },
                },
                { new: true, upsert: true }
            )
            .exec() as unknown as Promise<PendingReservationDocument>
    }

    /**
     * Holds activos del slot, más viejos primero (desempate por _id).
     */
    async findActiveBySlotOrdered(
        slotId: string | Types.ObjectId
    ): Promise<PendingReservationDocument[]> {
        return this.model
            .find({
                slotId,
                holdUntil: { $gt: new Date() },
            })
            .sort({ holdAcquiredAt: 1, createdAt: 1, _id: 1 })
            .lean()
            .exec() as unknown as Promise<PendingReservationDocument[]>
    }

    /**
     * Tras un upsert concurrente: solo los primeros `allowed` holds (por
     * holdAcquiredAt) se quedan. Si este pending no entra, se expira y devuelve false.
     */
    async claimHoldIfWithinCapacity(
        pendingId: string | Types.ObjectId,
        slotId: string | Types.ObjectId,
        allowed: number
    ): Promise<boolean> {
        if (allowed <= 0) {
            await this.expireHold(pendingId)
            return false
        }

        const active = await this.findActiveBySlotOrdered(slotId)
        const winners = active.slice(0, allowed)
        const won = winners.some(
            (p) => String(p._id) === String(pendingId)
        )

        if (!won) {
            await this.expireHold(pendingId)
            return false
        }
        return true
    }

    async expireHold(
        pendingId: string | Types.ObjectId
    ): Promise<PendingReservationDocument | null> {
        const now = new Date()
        return this.model
            .findOneAndUpdate(
                { _id: pendingId },
                {
                    $set: {
                        holdUntil: now,
                        updatedAt: now,
                    },
                },
                { new: true }
            )
            .lean()
            .exec() as unknown as Promise<PendingReservationDocument | null>
    }

    /** @deprecated Preferir renewActiveHold / upsertAcquiringHold. */
    async createReservation(
        data: PendingReservationInput
    ): Promise<PendingReservationDocument> {
        return this.upsertAcquiringHold(data)
    }

    /** Sin filtro de vigencia: el webhook puede llegar después del hold. */
    async findLeanById(
        pendingId: string | Types.ObjectId
    ): Promise<PendingReservationDocument | null> {
        return this.model
            .findById(pendingId)
            .lean()
            .exec() as unknown as Promise<PendingReservationDocument | null>
    }

    async countActiveBySlot(
        slotId: string | Types.ObjectId,
        excludeUserKey?: string
    ): Promise<number> {
        const filter: Record<string, unknown> = {
            slotId,
            holdUntil: { $gt: new Date() },
        }
        if (excludeUserKey) {
            filter.userKey = { $ne: excludeUserKey }
        }
        return this.count(filter)
    }

    async findActiveByService(
        serviceId: string | Types.ObjectId
    ): Promise<PendingReservationDocument[]> {
        return this.model
            .find({
                serviceId,
                holdUntil: { $gt: new Date() },
            })
            .lean()
            .exec() as unknown as Promise<PendingReservationDocument[]>
    }

    async findActiveByServiceIds(
        serviceIds: Array<string | Types.ObjectId>
    ): Promise<PendingReservationDocument[]> {
        if (serviceIds.length === 0) return []
        return this.model
            .find({
                serviceId: { $in: serviceIds },
                holdUntil: { $gt: new Date() },
            })
            .lean()
            .exec() as unknown as Promise<PendingReservationDocument[]>
    }

    async deleteByServiceAndId(
        serviceId: string | Types.ObjectId,
        pendingId: string | Types.ObjectId,
        opts: SessionOpts = {}
    ): Promise<PendingReservationDocument | null> {
        return this.model
            .findOneAndDelete(
                { _id: pendingId, serviceId },
                { session: opts.session ?? undefined }
            )
            .lean()
            .exec() as unknown as Promise<PendingReservationDocument | null>
    }

    async deleteByIdWithSession(
        pendingId: string | Types.ObjectId,
        opts: SessionOpts = {}
    ): Promise<PendingReservationDocument | null> {
        return this.model
            .findByIdAndDelete(pendingId, {
                session: opts.session ?? undefined,
            })
            .lean()
            .exec() as unknown as Promise<PendingReservationDocument | null>
    }

    async setPreferenceExternalRef(
        pendingId: string | Types.ObjectId,
        preferenceExternalRef: string
    ): Promise<PendingReservationDocument | null> {
        return this.updateById(pendingId, {
            $set: { preferenceExternalRef, updatedAt: new Date() },
        })
    }
}
