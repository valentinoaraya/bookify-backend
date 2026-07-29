import { Types, Document } from "mongoose"
import { Email } from "../../types"

export type PlanType = "individual" | "individual_plus" | "team"
export type SuscriptionStatus =
    | "active"
    | "inactive"
    | "pending"
    | "upgrading"
    | "downgrading"
    | "cancelling"

export interface CompanyReminder {
    hoursBefore: number
    services: Types.ObjectId[]
}

export interface CompanyAttrs {
    name: string
    company_id: string
    email: string
    password: string
    province?: string
    city?: string
    street?: string
    number?: string
    phone: string
    payer_email?: string
    subscriptionId?: Types.ObjectId
    role: "admin" | "user"
    services: Types.ObjectId[]
    connectedWithMP: boolean
    mp_access_token: string
    mp_refresh_token: string
    token_expires_in: number
    mp_user_id: string
    reminders: CompanyReminder[]
    slotsVisibilityDays: number
    cancellationAnticipationHours: number
    bookingAnticipationHours: number
    refresh_token: string
    createdAt: Date
    updatedAt: Date
}

export interface CompanyDocument extends CompanyAttrs, Document {
    _id: Types.ObjectId
}

export interface AuthTokens {
    access_token: string
    refresh_token: string
}

export interface AuthCompanyPayload {
    id: Types.ObjectId
    name: string
    email: Email
}

export interface RegisterCompanyInput {
    name: string
    email: string
    password: string
    phone: string
    plan: PlanType
    payer_email: string
    province: string
    city: string
    street: string
    number: string
}

export interface LoginCompanyInput {
    email: string
    password: string
}

export interface UpdateCompanyInput {
    name?: string
    phone?: string
    email?: string
    province?: string
    city?: string
    street?: string
    number?: string
    company_id?: string
    reminders?: Array<{
        hoursBefore: number
        services: string[]
    }>
    cancellationAnticipationHours?: number
    bookingAnticipationHours?: number
    slotsVisibilityDays?: number
}
