export type Email = `${string}@${string}`

export interface CompanyInputs {
    name: string,
    email: Email
    password: string
    location: string
}