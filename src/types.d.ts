export type Email = `${string}@${string}`

interface InputsCommon{
    email: Email
    password: string
    phone?: string
}

export interface CompanyInputs extends InputsCommon {
    name: string,
    location: string
}

export interface UserInputs extends InputsCommon {
    username: string
}

export interface Login {
    name: string
    password: string
}