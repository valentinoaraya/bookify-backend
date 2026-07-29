import { Types, Document } from "mongoose"
import { PlanType, SuscriptionStatus } from "../company/company.types"

export type SubscriptionStatus = SuscriptionStatus
export type SubscriptionPlan = PlanType

export interface SubscriptionAttrs {
    companyId: Types.ObjectId
    mpPreapprovalId?: string
    plan: SubscriptionPlan
    /** Plan destino mientras status === upgrading (el plan vigente no cambia hasta authorized). */
    pendingPlan?: SubscriptionPlan
    status: SubscriptionStatus
    startDate?: Date
    nextPaymentDate?: string
    previousPreapprovalId?: string
    transitionStartedAt?: Date
    createdAt: Date
    updatedAt: Date
}

export interface SubscriptionDocument extends SubscriptionAttrs, Document {
    _id: Types.ObjectId
}

export interface SubscriptionInput {
    companyId: Types.ObjectId | string
    mpPreapprovalId?: string
    plan: SubscriptionPlan
    pendingPlan?: SubscriptionPlan | null
    status: SubscriptionStatus
    startDate?: Date
    nextPaymentDate?: string
    /** null explícito limpia el campo (no usar undefined para unset). */
    previousPreapprovalId?: string | null
    transitionStartedAt?: Date | null
}

/** Forma de respuesta API (sin typo suscription). */
export interface SubscriptionApiShape {
    id: string
    plan: SubscriptionPlan
    pendingPlan?: SubscriptionPlan
    status: SubscriptionStatus
    mpPreapprovalId?: string
    startDate?: Date
    nextPaymentDate?: string
}
