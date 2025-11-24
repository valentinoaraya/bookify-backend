import CompanyModel from "../models/Company";
import { BasicInfoWithID, CompanyInputs, CompanyWithoutPassword, Email, Service, UserData, UserInputAppointment, UserInputs } from "../types";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken"
import { JWT_KEY } from "../config";
import { normalizeEmail } from "../services/emailService";

const isString = (param: any): boolean => {
    return (typeof param === "string" || param instanceof String)
}

const isNumber = (param: any): boolean => {
    return (typeof param === "number")
}

const isEmail = (param: any): boolean => {
    if (typeof param != "string") return false
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(param.trim());
}

const isDate = (param: any): boolean => {
    return Boolean(Date.parse(param))
}

const hashPassword = async (password: string): Promise<string> => {
    const hashedPassword = await bcrypt.hash(password, 10)
    return hashedPassword
}

const parseInput = (input: any, nameInput: string): string => {
    if (!isString(input)) throw new Error(`${nameInput} incorrecto o incompleto.`)
    return input
}

const parseNumber = (input: any, nameInput: string): number => {
    if (!isNumber(input)) throw new Error(`${nameInput} incorrecto o incompleto.`)
    return input
}

const parseEmail = (emailFromRequest: any): Email => {
    if (!isEmail(emailFromRequest)) throw new Error("Email incorrecto o incompleto.")
    return emailFromRequest.trim()
}

const parsePassword = async (passwordFromRequest: any): Promise<string> => {
    if (!isString(passwordFromRequest)) throw new Error("La contraseña debe ser un string.")
    if ((passwordFromRequest as string).length < 6) throw new Error("La contraseña debe contener al menos 6 caracteres")

    return passwordFromRequest
}

const parseDate = (dateFromRequest: any): Date => {
    if (!isDate(dateFromRequest)) throw new Error("Fecha incorrecta.")
    return dateFromRequest
}

export const verifyUserInputs = (object: any): UserData => {

    const email = parseEmail(object.email)
    const normalizedEmail = normalizeEmail(email)

    return {
        name: parseInput(object.name, "name").trim(),
        lastName: parseInput(object.lastName, "lastName").trim(),
        dni: parseInput(object.dni, "dni").trim(),
        email: normalizedEmail,
        phone: parseInput(object.phone, "phone").trim()
    }
}

export const companyToAdd = async (object: any): Promise<CompanyInputs> => {

    const newPassword = await parsePassword(object.password)
    const hashedPassword = await hashPassword(newPassword)

    const newCompany: CompanyInputs = {
        name: parseInput(object.name, "Nombre").trim(),
        company_id: Math.random().toString(36).slice(2, 11),
        email: parseEmail(object.email),
        password: hashedPassword,
        phone: parseInput(object.phone, "Teléfono").trim(),
        suscription: {
            plan: parseInput(object.plan, "Plan").trim() as any,
            status_suscription: "pending",
            start_date: new Date()
        }
    }

    if (object.city !== undefined) {
        newCompany.city = parseInput(object.city, "Ciudad").trim()
    }

    if (object.street !== undefined) {
        newCompany.street = parseInput(object.street, "Calle").trim()
    }

    if (object.number !== undefined) {
        newCompany.number = parseInput(object.number, "Número").trim()
    }

    return newCompany
}

export const userToAdd = async (object: any): Promise<UserInputs> => {

    const newPassword = await parsePassword(object.password)
    const hashedPasswoed = await hashPassword(newPassword)

    const newUser: UserInputs = {
        name: parseInput(object.name, "Nombre").trim(),
        lastName: parseInput(object.lastName, "Apellido").trim(),
        email: parseEmail(object.email),
        password: hashedPasswoed,
        phone: parseInput(object.phone, "Teléfono").trim()
    }

    return newUser
}

export const verifyToLoginCompany = async (object: any): Promise<BasicInfoWithID> => {
    const { email, password } = object

    const newEmail = parseEmail(email)
    const newPassword = await parsePassword(password)

    const companyFound = await CompanyModel.findOne({ email: newEmail })

    if (!companyFound) throw new Error("Empresa no existente.")

    const isValid = await bcrypt.compare(newPassword, companyFound.password)

    if (!isValid) throw new Error("Contraseña incorrecta.")

    return {
        id: companyFound._id,
        name: companyFound.name,
        email: companyFound.email as Email
    }
}

export const createToken = (data: BasicInfoWithID): string => {
    const token = jwt.sign(data, JWT_KEY as string, { expiresIn: "1h" })
    return token
}

export const createRefreshToken = (data: BasicInfoWithID): string => {
    const refreshToken = jwt.sign(data, JWT_KEY as string, { expiresIn: "7d" })
    return refreshToken
}

export const createTokens = (data: BasicInfoWithID): { access_token: string, refresh_token: string } => {
    const access_token = createToken(data)
    const refresh_token = createRefreshToken(data)
    return { access_token, refresh_token }
}

export const serviceToAdd = (object: any): Service => {
    const service: Service = {
        title: parseInput(object.title, "Titulo").trim(),
        description: parseInput(object.description, "Descripción").trim(),
        price: parseNumber(object.price, "Precio"),
        capacityPerShift: parseNumber(object.capacityPerShift, "Capacidad de personas") <= 0 ? 1 : parseNumber(object.capacityPerShift, "Capacidad de personas"),
        duration: parseNumber(object.duration, "Duración"),
        signPrice: parseNumber(object.signPrice, "Precio de seña"),
        mode: object.mode && (object.mode === "in-person" || object.mode === "online") ? object.mode : "online"
    }

    return service
}

export const serviceToUpdate = (object: any) => {
    const { title, description, price, duration, signPrice, capacityPerShift, mode } = object
    const updateFields: any = {}
    if (title != undefined) updateFields.title = title.trim()
    if (description != undefined) updateFields.description = description.trim()
    if (price != undefined) updateFields.price = price
    if (capacityPerShift != undefined && capacityPerShift > 0) updateFields.capacityPerShift = capacityPerShift
    if (duration != undefined) updateFields.duration = duration
    if (signPrice != undefined) updateFields.signPrice = signPrice
    if (mode != undefined && (mode === "in-person" || mode === "online")) updateFields.mode = mode

    return updateFields
}

export const appointmentToAdd = (object: any): UserInputAppointment => {
    const newAppointment: UserInputAppointment = {
        date: parseDate(object.date),
        serviceId: parseInput(object.serviceId, "ID de Servicio").trim(),
        companyId: parseInput(object.companyId, "ID de Empresa").trim(),
        paymentId: object.paymentId ? object.paymentId : null,
        totalPaidAmount: object.totalPaidAmount ? parseNumber(object.totalPaidAmount, "Total pagado") : undefined
    }

    return newAppointment
}

export const companyToSend = async (id: string): Promise<CompanyWithoutPassword> => {
    const company = await CompanyModel.findById(id).populate("services", "_id description duration price title companyId")
    if (!company) throw new Error("Empresa no existente.")

    const newCompany: CompanyWithoutPassword = {
        _id: company._id,
        company_id: company.company_id,
        name: company.name,
        services: company.services,
        city: company.city,
        street: company.street,
        number: company.number,
        phone: company.phone,
        email: company.email as Email,
        reminders: [],
        bookingAnticipationHours: 1,
        cancellationAnticipationHours: 24
    }

    return newCompany
}