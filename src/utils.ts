import CompanyModel from "./models/Company";
import UserModel from "./models/User";
import { BasicInfoWithID, BasicInfoWithIDRole, CompanyInputs, CompanyWithoutPassword, Email, Service, UserInputAppointment, UserInputs } from "./types";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken"
import { JWT_KEY } from "./config";


const isString = (param: any): boolean => {
    return (typeof param === "string" || param instanceof String)
}

const isNumber = (param: any): boolean => {
    return (typeof param === "number")
}

const isEmail = (param: any): boolean => {
    if (typeof param != "string") return false
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(param);
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
    return emailFromRequest
}

const parsePassword = async (passwordFromRequest: any): Promise<string> => {
    if (!isString(passwordFromRequest)) throw new Error("La contraseña debe ser un string.")
    if ((passwordFromRequest as string).length < 6) throw new Error("La contraseña debe contener al menos 6 caracteres")

    return passwordFromRequest
}

const parseDate = (dateFromRequest: any): Date => {
    if (!isDate(dateFromRequest) || !isString(dateFromRequest)) throw new Error("Fecha incorrecta.")
    return dateFromRequest
}

// Registrar

export const companyToAdd = async (object: any): Promise<CompanyInputs> => {

    const newPassword = await parsePassword(object.password)
    const hashedPassword = await hashPassword(newPassword)

    const newCompany: CompanyInputs = {
        name: parseInput(object.name, "Nombre"),
        email: parseEmail(object.email),
        password: hashedPassword,
        phone: parseInput(object.phone, "Teléfono"),
        city: parseInput(object.city, "Ubicación"),
        street: parseInput(object.street, "Calle"),
        number: parseInput(object.number, "Número de calle")
    }

    return newCompany
}

export const userToAdd = async (object: any): Promise<UserInputs> => {

    const newPassword = await parsePassword(object.password)
    const hashedPasswoed = await hashPassword(newPassword)

    const newUser: UserInputs = {
        name: parseInput(object.name, "Nombre"),
        lastName: parseInput(object.lastName, "Apellido"),
        email: parseEmail(object.email),
        password: hashedPasswoed,
        phone: parseInput(object.phone, "Teléfono")
    }

    return newUser
}

// Chequear datos para el logueo de empresas o usuarios

export const verifyToLoginUser = async (object: any): Promise<BasicInfoWithIDRole> => {
    const { email, password } = object

    const newEmail = parseEmail(email)
    const newPassword = await parsePassword(password)

    const userFound = await UserModel.findOne({ email: newEmail })

    if (!userFound) throw new Error("Usuario no existente.")

    const isValid = await bcrypt.compare(newPassword, userFound.password)

    if (!isValid) throw new Error("Contraseña incorrecta.")

    return {
        id: userFound._id,
        name: userFound.name,
        email: userFound.email as Email,
        rol: userFound.role
    }
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

// Servicios

export const serviceToAdd = (object: any): Service => {

    const service: Service = {
        title: parseInput(object.title, "Titulo"),
        description: parseInput(object.description, "Descripción"),
        price: parseNumber(object.price, "Precio"),
        duration: parseNumber(object.duration, "Duración")
    }

    return service
}

export const serviceToUpdate = (object: any) => {

    const { title, description, price, duration } = object
    const updateFields: any = {}
    if (title != undefined) updateFields.title = title
    if (description != undefined) updateFields.description = description
    if (price != undefined) updateFields.price = price
    if (duration != undefined) updateFields.duration = duration

    return updateFields
}

// Turnos

export const appointmentToAdd = (object: any): UserInputAppointment => {
    const newAppointment: UserInputAppointment = {
        date: parseDate(object.date),
        serviceId: parseInput(object.serviceId, "ID de Servicio"),
        companyId: parseInput(object.companyId, "ID de Empresa")
    }

    return newAppointment
}

// Empresas

export const companyToSend = async (id: string): Promise<CompanyWithoutPassword> => {
    const company = await CompanyModel.findById(id).populate("services", "_id description duration price title companyId")
    if (!company) throw new Error("Empresa no existente.")

    const newCompany: CompanyWithoutPassword = {
        _id: company._id,
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