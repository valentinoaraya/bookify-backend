import { Types, Document } from "mongoose"
import { CompanyLocationSnapshot } from "../company/company.types"

export type AppointmentStatus =
    | "scheduled"
    | "finished"
    | "cancelled"
    | "pending_action"
    | "did_not_attend"

export type CancelledBy = "company" | "client" | "null"

export type AppointmentMode = "in-person" | "online" | "in-person-at-home"

export interface AppointmentServiceInfo {
    title: string
}

export interface AppointmentAttrs {
    companyId: Types.ObjectId
    serviceId: Types.ObjectId
    slotId?: Types.ObjectId
    name: string
    price: number
    duration: number
    serviceInfo?: AppointmentServiceInfo
    lastName: string
    email: string
    dni: string
    phone: string
    status: AppointmentStatus
    cancelledBy: CancelledBy
    date: Date
    reminderJobs: string[]
    mode: AppointmentMode
    location?: CompanyLocationSnapshot
    userLocation?: string
    paymentId?: string | null
    paymentRef?: Types.ObjectId | null
    totalPaidAmount?: number
    createdAt: Date
    updateAt: Date
    updatedAt?: Date
}

export interface AppointmentDocument extends AppointmentAttrs, Document {
    _id: Types.ObjectId
}

export interface AppointmentUserData {
    name: string
    lastName: string
    email: string
    phone: string
    dni: string
    userLocation?: string
}

export interface ConfirmAppointmentInput {
    date: string
    serviceId: string
    companyId: string
    /** Sede elegida para servicios presenciales con más de una sede. */
    locationId?: string
}

export interface PaymentWebhookBody {
    type?: string
    action?: string
    data?: { id?: string | number }
    user_id?: string | number
}

export interface CheckOrderTimeInput {
    companyId: string
    date: string | Date
}

export interface ChangeStatusInput {
    appointmentId: string
    status: AppointmentStatus
}

export interface CompanyHistoryQuery {
    page?: number | string
    limit?: number | string
    from?: string
    to?: string
    q?: string
    serviceId?: string
}

export interface DeleteByCompanyResult {
    serviceToSend: Record<string, any> | null
    appointment: Record<string, any>
    dateInString: string
}
