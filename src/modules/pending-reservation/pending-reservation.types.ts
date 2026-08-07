import { Types, Document } from "mongoose"

export interface PendingReservationUserData {
    name: string
    lastName: string
    email: string
    dni: string
    phone: string
    userLocation?: string
    locationId?: string
}

export interface PendingReservationAttrs {
    slotId: Types.ObjectId
    serviceId: Types.ObjectId
    companyId: Types.ObjectId
    userKey: string
    userData?: PendingReservationUserData
    /** Hasta cuándo la reserva bloquea el slot. */
    holdUntil?: Date
    /**
     * Momento en que este hold ocupó cupo (no se renueva en reintentos activos).
     * Sirve para desempatar carreras: ganan los más viejos hasta capacity - taken.
     */
    holdAcquiredAt?: Date
    /** Momento de borrado físico por TTL. */
    expiresAt: Date
    preferenceExternalRef?: string
    createdAt: Date
    updatedAt: Date
}

export interface PendingReservationDocument extends PendingReservationAttrs, Document {
    _id: Types.ObjectId
}

export interface PendingReservationInput {
    slotId: Types.ObjectId | string
    serviceId: Types.ObjectId | string
    companyId: Types.ObjectId | string
    userKey: string
    userData?: PendingReservationUserData
    holdUntil: Date
    expiresAt: Date
    holdAcquiredAt?: Date
    preferenceExternalRef?: string
}
