import { Service, UserData, UserInputAppointment } from "../types";
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

const parseInput = (input: any, nameInput: string): string => {
    if (!isString(input)) throw new Error(`${nameInput} incorrecto o incompleto.`)
    return input
}

const parseNumber = (input: any, nameInput: string): number => {
    if (!isNumber(input)) throw new Error(`${nameInput} incorrecto o incompleto.`)
    return input
}

const parseEmail = (emailFromRequest: any): string => {
    if (!isEmail(emailFromRequest)) throw new Error("Email incorrecto o incompleto.")
    return emailFromRequest.trim()
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
        phone: parseInput(object.phone, "phone").trim(),
        userLocation: object.userLocation ? parseInput(object.userLocation, "userLocation").trim() : undefined
    }
}

export const serviceToAdd = (object: any): Service => {
    const service: Service = {
        title: parseInput(object.title, "Titulo").trim(),
        description: parseInput(object.description, "Descripción").trim(),
        price: parseNumber(object.price, "Precio"),
        capacityPerShift: parseNumber(object.capacityPerShift, "Capacidad de personas") <= 0 ? 1 : parseNumber(object.capacityPerShift, "Capacidad de personas"),
        duration: parseNumber(object.duration, "Duración"),
        signPrice: parseNumber(object.signPrice, "Precio de seña"),
        mode: object.mode && (object.mode === "in-person" || object.mode === "online" || object.mode === "in-person-at-home") ? object.mode : "online"
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
    if (mode != undefined && (mode === "in-person" || mode === "online" || mode === "in-person-at-home")) updateFields.mode = mode

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
