import { Types, Document } from "mongoose"

export type ServiceMode = "in-person" | "online" | "in-person-at-home"

export interface WorkScheduleBlock {
    start: string
    end: string
}

/** Plantilla semanal de horarios de trabajo del servicio. days: 0=domingo … 6=sábado. */
export interface WorkSchedule {
    days: number[]
    blocks: WorkScheduleBlock[]
    turnIntervalMinutes: number
    graceMinutes: number
}

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
    /** Sedes (Company.locations._id) donde se ofrece el servicio presencial. */
    locationIds: Types.ObjectId[]
    signPrice: number
    workSchedule?: WorkSchedule
    autoGenerateSlots: boolean
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
    locationIds?: string[]
}

export interface UpdateServiceInput {
    title?: string
    description?: string
    price?: number
    capacityPerShift?: number
    duration?: number
    signPrice?: number
    mode?: ServiceMode
    locationIds?: string[]
}

export interface EnableSlotsInput {
    hourStart: string
    hourFinish: string
    turnEach: string
    days: string[]
}

export interface UpdateWorkScheduleInput {
    workSchedule: WorkSchedule
    autoGenerateSlots: boolean
}
