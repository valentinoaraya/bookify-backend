import { Types } from "mongoose"

export type Email = `${string}@${string}`

export interface BasicInfo {
    name: string
    email: Email
}

export interface BasicInfoWithID extends BasicInfo {
    id: Types.ObjectId
}

interface InputsCommon extends BasicInfo{
    password: string
    phone: string
}

export interface CompanyInputs extends InputsCommon {
    location: string
}

export interface UserInputs extends InputsCommon {
    lastName: string
}
