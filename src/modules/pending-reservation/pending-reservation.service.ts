import moment from "moment-timezone"
import { ClientSession, Types } from "mongoose"
import { getIO } from "../../infrastructure/realtime/socket"
import { formatDateTime } from "../../shared/utils/datetime"
import { ServiceMapper } from "../service/service.mapper"
import { ServiceRepository } from "../service/service.repository"
import { SlotRepository } from "../slot/slot.repository"
import { SlotDocument } from "../slot/slot.types"
import { PendingReservationRepository } from "./pending-reservation.repository"
import {
    PendingReservationDocument,
    PendingReservationUserData,
} from "./pending-reservation.types"

type SessionOpts = { session?: ClientSession | null }

/** Minutos que la reserva temporal bloquea el slot mientras el cliente paga. */
const HOLD_MINUTES = 15
/** Horas que el documento sobrevive, para servir a webhooks demorados. */
const RETENTION_HOURS = 24

/**
 * Reservas temporales (TTL) sobre slots. Reemplaza PendingSlotService.
 */
export class PendingReservationService {
    constructor(
        private readonly pendingReservationRepository: PendingReservationRepository,
        private readonly slotRepository: SlotRepository,
        private readonly serviceRepository: ServiceRepository
    ) {}

    /**
     * Marca un slot como pendiente.
     * Acepta slotId directo, o serviceId + datetime (API actual de preferencias).
     */
    async markAsPending(
        serviceIdOrSlotId: string,
        dateOrUserKey: Date | string,
        userKeyMaybe?: string,
        userData?: PendingReservationUserData
    ): Promise<string | null> {
        try {
            let slot: SlotDocument | null
            let userKey: string

            if (userKeyMaybe !== undefined && dateOrUserKey instanceof Date) {
                // markAsPending(serviceId, datetime, userKey)
                userKey = userKeyMaybe
                slot = await this.slotRepository.findByServiceAndDatetime(
                    serviceIdOrSlotId,
                    dateOrUserKey
                )
            } else if (typeof dateOrUserKey === "string") {
                // markAsPending(slotId, userKey)
                userKey = dateOrUserKey
                slot = await this.slotRepository.findById(serviceIdOrSlotId, true)
            } else {
                return null
            }

            if (!slot) return null

            const serviceId = String(slot.serviceId)
            const holdUntil = moment().add(HOLD_MINUTES, "minutes").toDate()
            const expiresAt = moment().add(RETENTION_HOURS, "hours").toDate()

            // Reintento del mismo usuario con hold vigente: renovar sin competir.
            const existing =
                await this.pendingReservationRepository.findBySlotAndUser(
                    slot._id,
                    userKey
                )
            if (existing?.holdUntil && existing.holdUntil > new Date()) {
                const renewed =
                    await this.pendingReservationRepository.renewActiveHold(
                        existing._id,
                        { userData, holdUntil, expiresAt }
                    )
                if (!renewed) return null
                await this.emitServiceUpdated(serviceId)
                return renewed._id.toString()
            }

            // 1) Upsert compitiendo por cupo (holdAcquiredAt = ahora).
            // 2) Quedarse solo si está entre los primeros `capacity - taken`
            //    ordenados por llegada. Así dos requests concurrentes no
            //    over-holdean: el perdedor se expira.
            const pending =
                await this.pendingReservationRepository.upsertAcquiringHold({
                    slotId: slot._id.toString(),
                    serviceId,
                    companyId: String(slot.companyId),
                    userKey,
                    userData,
                    holdUntil,
                    expiresAt,
                    holdAcquiredAt: new Date(),
                })

            const freshSlot = await this.slotRepository.findById(slot._id, true)
            if (!freshSlot) {
                await this.pendingReservationRepository.expireHold(pending._id)
                return null
            }

            const allowed = Math.max(0, freshSlot.capacity - freshSlot.taken)
            const claimed =
                await this.pendingReservationRepository.claimHoldIfWithinCapacity(
                    pending._id,
                    slot._id,
                    allowed
                )
            if (!claimed) return null

            await this.emitServiceUpdated(serviceId)
            return pending._id.toString()
        } catch (error) {
            console.error("Error al marcar turno como pendiente:", error)
            return null
        }
    }

    async isAvailable(
        serviceId: string,
        date: Date,
        userKey?: string
    ): Promise<boolean> {
        try {
            const slot = await this.slotRepository.findByServiceAndDatetime(
                serviceId,
                date
            )
            if (!slot) return false

            const pendingByOthers =
                await this.pendingReservationRepository.countActiveBySlot(
                    slot._id,
                    userKey
                )

            return slot.taken + pendingByOthers < slot.capacity
        } catch (error) {
            console.error("Error al verificar disponibilidad del turno:", error)
            return false
        }
    }

    async removePending(
        serviceIdOrPendingId: string,
        pendingIdMaybe?: string
    ): Promise<boolean> {
        try {
            let removed: PendingReservationDocument | null

            if (pendingIdMaybe) {
                removed =
                    await this.pendingReservationRepository.deleteByServiceAndId(
                        serviceIdOrPendingId,
                        pendingIdMaybe
                    )
            } else {
                removed = await this.pendingReservationRepository.deleteById(
                    serviceIdOrPendingId
                )
            }

            if (!removed) return false

            await this.emitServiceUpdated(removed.serviceId)
            return true
        } catch (error) {
            console.error("Error al remover reserva pendiente:", error)
            return false
        }
    }

    /** Borrado silencioso (sin socket) para usar dentro de transacciones. */
    async deletePending(
        serviceId: string,
        pendingId: string,
        opts: SessionOpts = {}
    ): Promise<PendingReservationDocument | null> {
        return this.pendingReservationRepository.deleteByServiceAndId(
            serviceId,
            pendingId,
            opts
        )
    }

    async notifyServiceUpdated(serviceId: string | Types.ObjectId): Promise<void> {
        await this.emitServiceUpdated(serviceId)
    }

    /** Usado por el webhook de pago para recuperar los datos de la reserva. */
    async getById(pendingId: string): Promise<PendingReservationDocument | null> {
        if (!Types.ObjectId.isValid(pendingId)) return null
        return this.pendingReservationRepository.findLeanById(pendingId)
    }

    async setPreferenceExternalRef(
        pendingId: string,
        preferenceExternalRef: string
    ): Promise<void> {
        await this.pendingReservationRepository.setPreferenceExternalRef(
            pendingId,
            preferenceExternalRef
        )
    }

    private async emitServiceUpdated(
        serviceId: string | Types.ObjectId
    ): Promise<void> {
        const service = await this.serviceRepository.findLeanById(serviceId)
        if (!service) return

        const [slots, pendings] = await Promise.all([
            this.slotRepository.findAllByService(serviceId),
            this.pendingReservationRepository.findActiveByService(serviceId),
        ])

        const slotById = new Map(slots.map((s) => [s._id.toString(), s]))
        const pendingAppointments = pendings.map((p) => {
            const slot = slotById.get(p.slotId.toString())
            return {
                _id: p._id,
                datetime: slot?.datetime ?? new Date(),
                // El consumidor muestra hasta cuándo está retenido el turno.
                expiresAt: p.holdUntil ?? p.expiresAt,
                userId: p.userKey,
            }
        })

        const formatted = ServiceMapper.withSlots(
            service,
            slots,
            pendingAppointments.map((pending) => ({
                ...pending,
                datetime: formatDateTime(pending.datetime),
            }))
        )

        getIO()
            .to(String(service.companyId))
            .emit("company:service-updated", formatted)
    }
}

/** Alias de compatibilidad con el nombre anterior. */
export type PendingSlotService = PendingReservationService
