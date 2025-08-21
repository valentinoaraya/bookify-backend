import CompanyModel from "../models/Company";
import { BasicInfoWithID, CompanyInputs, CompanyWithoutPassword, Email, Service, UserData, UserInputAppointment, UserInputs } from "../types";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken"
import { JWT_KEY } from "../config";

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
    return {
        name: parseInput(object.name, "name").trim(),
        lastName: parseInput(object.lastName, "lastName").trim(),
        dni: parseInput(object.dni, "dni").trim(),
        email: parseEmail(object.email),
        phone: parseInput(object.phone, "phone").trim()
    }
}

export const companyToAdd = async (object: any): Promise<CompanyInputs> => {

    const newPassword = await parsePassword(object.password)
    const hashedPassword = await hashPassword(newPassword)

    const newCompany: CompanyInputs = {
        name: parseInput(object.name, "Nombre").trim(),
        company_id: parseInput(object.company_id, "ID de empresa").trim(),
        email: parseEmail(object.email),
        password: hashedPassword,
        phone: parseInput(object.phone, "Teléfono").trim(),
        city: parseInput(object.city, "Ubicación").trim(),
        street: parseInput(object.street, "Calle").trim(),
        number: parseInput(object.number, "Número de calle").trim()
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

export const serviceToAdd = (object: any): Service => {
    const service: Service = {
        title: parseInput(object.title, "Titulo").trim(),
        description: parseInput(object.description, "Descripción").trim(),
        price: parseNumber(object.price, "Precio"),
        capacityPerShift: parseNumber(object.capacityPerShift, "Capacidad de personas") <= 0 ? 1 : parseNumber(object.capacityPerShift, "Capacidad de personas"),
        duration: parseNumber(object.duration, "Duración"),
        signPrice: parseNumber(object.signPrice, "Precio de seña")
    }

    return service
}

export const serviceToUpdate = (object: any) => {
    const { title, description, price, duration, signPrice, capacityPerShift } = object
    const updateFields: any = {}
    if (title != undefined) updateFields.title = title.trim()
    if (description != undefined) updateFields.description = description.trim()
    if (price != undefined) updateFields.price = price
    if (capacityPerShift != undefined && capacityPerShift > 0) updateFields.capacityPerShift = capacityPerShift
    if (duration != undefined) updateFields.duration = duration
    if (signPrice != undefined) updateFields.signPrice = signPrice

    return updateFields
}

export const appointmentToAdd = (object: any): UserInputAppointment => {
    const newAppointment: UserInputAppointment = {
        date: parseDate(object.date),
        serviceId: parseInput(object.serviceId, "ID de Servicio"),
        companyId: parseInput(object.companyId, "ID de Empresa"),
        paymentId: object.paymentId ? object.paymentId : null
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
        email: company.email as Email
    }

    return newCompany
}