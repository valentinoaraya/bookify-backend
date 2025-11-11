import { Types } from "mongoose"
import { Request } from "express"

export type Email = `${string}@${string}`

export interface BasicInfo {
    name: string
    email: Email
}

export interface BasicInfoWithID extends BasicInfo {
    id: Types.ObjectId
}

export interface BasicInfoWithIDRole extends BasicInfoWithID {
    rol: "user" | "admin"
}

interface InputsCommon extends BasicInfo {
    password: string
    phone: string
}

export interface CompanyInputs extends InputsCommon {
    company_id: string
    city?: string | null
    street?: string | null
    number?: string | null
    suscription: {
        plan: "individual" | "individual_plus" | "team",
        suscription_id?: string
        status_suscription: "active" | "inactive" | "pending" | "upgrading" | "downgrading",
        start_date?: Date,
        next_payment_date?: string,
    }
}

export interface UserInputs extends InputsCommon {
    lastName: string
}

export interface UserData {
    name: string
    lastName: string
    email: string
    phone: string
    dni: string
}

declare module "express-serve-static-core" {
    interface Request {
        user?: UserData
        company?: BasicInfoWithID
    }
}

export interface Service {
    title: string
    capacityPerShift: number
    description: string
    price: number
    duration: number
    signPrice: number
    mode: "in-person" | "online"
}

export interface ServiceWithAppointments extends Service {
    availableAppointments: AvailableAppointment[]
    scheduledAppointments: Date[]
    pendingAppointments: PendingAppointment[]
}

export interface UserInputAppointment {
    date: Date
    serviceId: string
    companyId: string
    paymentId?: string
    totalPaidAmount?: number
}

export interface PopulatedAppointment {
    _id: string;
    date: Date;
    serviceId: Service;
    companyId: Company;
}

export interface Company extends CompanyInputs {
    _id: Types.ObjectId
    services: Types.ObjectId[]
    reminders: {
        hoursBefore: number
        services: Types.ObjectId[]
    }[]
    cancellationAnticipationHours: number
    bookingAnticipationHours: number
}

export type CompanyWithoutPassword = Omit<Company, "password" | "suscription">

export interface AvailableAppointment {
    datetime: Date
    capacity: number
    taken: number
}

export interface PendingAppointment {
    datetime: Date
    expiresAt: Date
    userId: string
}

export interface AvailableAppointmentInString {
    datetime: string
    capacity: number
    taken: number
}