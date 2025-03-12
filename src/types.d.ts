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
    city: string
    street: string
    number: string
}

export interface UserInputs extends InputsCommon {
    lastName: string
}

declare module "express-serve-static-core" {
    interface Request {
        user?: BasicInfoWithIDRole
        company?: BasicInfoWithID
    }
}

export interface Service {
    title: string
    description: string
    price: number
    duration: number
    signPrice: number
}

export interface UserInputAppointment {
    date: Date
    serviceId: string
    companyId: string
}

export interface Company extends CompanyInputs {
    _id: Types.ObjectId
    services: Types.ObjectId[]
}

export type CompanyWithoutPassword = Omit<Company, "password">

export type AvailableAppointment = `${number}/${number}/${number} ${number}:${number}`