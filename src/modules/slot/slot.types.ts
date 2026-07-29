import { Types, Document, ClientSession } from "mongoose"

export interface SlotAttrs {
    serviceId: Types.ObjectId
    companyId: Types.ObjectId
    datetime: Date
    capacity: number
    taken: number
    createdAt: Date
    updatedAt: Date
}

export interface SlotDocument extends SlotAttrs, Document {
    _id: Types.ObjectId
}

export interface SlotInput {
    serviceId: Types.ObjectId | string
    companyId: Types.ObjectId | string
    datetime: Date
    capacity: number
    taken?: number
}

export type SessionOpts = { session?: ClientSession }
