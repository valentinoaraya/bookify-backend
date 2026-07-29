import { Types, Document } from "mongoose"

export type ServiceMode = "in-person" | "online" | "in-person-at-home"

/** Forma legacy / API derivada de slots (no se persiste en Service). */
export interface AvailableSlot {
    _id?: Types.ObjectId
    datetime: Date | string
    capacity: number
    taken: number
}

/** Forma legacy / API derivada de pending_reservations (no se persiste en Service). */
export interface PendingSlot {
    _id?: Types.ObjectId
    datetime: Date | string
    expiresAt: Date
    userId: string
}

export interface ServiceAttrs {
    companyId: Types.ObjectId
    active: boolean
    title: string
    capacityPerShift: number
    description?: string
    duration: number
    price?: number
    mode: ServiceMode
    signPrice: number
    createdAt: Date
    updatedAt: Date
}

export interface ServiceDocument extends ServiceAttrs, Document {
    _id: Types.ObjectId
}

export interface CreateServiceInput {
    title: string
    description: string
    price: number
    capacityPerShift: number
    duration: number
    signPrice: number
    mode: ServiceMode
}

export interface UpdateServiceInput {
    title?: string
    description?: string
    price?: number
    capacityPerShift?: number
    duration?: number
    signPrice?: number
    mode?: ServiceMode
}

export interface EnableSlotsInput {
    hourStart: string
    hourFinish: string
    turnEach: string
    days: string[]
}
