import { Types, Document } from "mongoose"

export type PaymentStatus =
    | "approved"
    | "refunded"
    | "partially_refunded"
    | "refund_pending"
    | "failed"

export interface PaymentAttrs {
    mpPaymentId: string
    companyId: Types.ObjectId
    appointmentId?: Types.ObjectId
    serviceId?: Types.ObjectId
    amount: number
    currency: string
    status: PaymentStatus
    refundedAmount: number
    idempotencyKey?: string
    raw?: Record<string, unknown>
    createdAt: Date
    updatedAt: Date
}

export interface PaymentDocument extends PaymentAttrs, Document {
    _id: Types.ObjectId
}

export interface PaymentInput {
    mpPaymentId: string
    companyId: Types.ObjectId | string
    appointmentId?: Types.ObjectId | string
    serviceId?: Types.ObjectId | string
    amount: number
    currency?: string
    status: PaymentStatus
    refundedAmount?: number
    idempotencyKey?: string
    raw?: Record<string, unknown>
}

export interface CreateIfAbsentResult {
    created: boolean
    payment: PaymentDocument
}
