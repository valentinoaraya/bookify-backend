import CompanyModel from "./models/Company";
import UserModel from "./models/User";
import {CompanyInputs, Email, UserInputs } from "./types"
import bcrypt from "bcrypt";

const isString = (param: any): boolean => {
    return (typeof param === "string" || param instanceof String)
}

const isEmail = (param: any): boolean => {
    if (typeof param != "string") return false        
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(param);
}

const parseInput = (input: any, nameInput: string): string => {
    if (!isString(input)) throw new Error(`${nameInput} incorrecto o incompleto.`)
    return input
}

const parseEmail = (emailFromRequest: any): Email => {
    if (!isEmail(emailFromRequest)) throw new Error("Email incorrecto o incompleto.")

    return emailFromRequest
}

const hashPassword = async (password: string): Promise<string> => {
    const hashedPassword = await bcrypt.hash(password, 10)
    return hashedPassword
}

const parsePassword = async (passwordFromRequest: any): Promise<string> => {
    if (!isString(passwordFromRequest)) throw new Error("La contraseña debe ser un string.")
    if ((passwordFromRequest as string).length < 6 ) throw new Error("La contraseña debe contener al menos 6 caracteres")

    return passwordFromRequest
}

// Registrar

export const companyToAdd = async (object: any): Promise<CompanyInputs> => {

    const newPassword = await parsePassword(object.password)
    const hashedPassword = await hashPassword(newPassword)

    const newCompany: CompanyInputs = {
        name: parseInput(object.name, "Nombre"),
        email: parseEmail(object.email),
        password: hashedPassword,
        location: parseInput(object.location, "Ubicación")
    }
    
    return newCompany
}

export const userToAdd = async (object: any): Promise<UserInputs> => {

    const newPassword = await parsePassword(object.password)
    const hashedPasswoed = await hashPassword(newPassword)

    const newUser: UserInputs = {
        username: parseInput(object.username, "Nombre"),
        email: parseEmail(object.email),
        password: hashedPasswoed,
        phone: parseInput(object.phone || null, "Teléfono")
    }

    return newUser
}

// Chequear datos para el logueo de empresas o usuarios

export const verifyToLogin = async (object: any): Promise<UserInputs> => {
    const {name, password} = object

    const newName = parseInput(name, "Nombre")
    const newPassword = await parsePassword(password)

    const userFound = await UserModel.findOne({username: newName})

    if (!userFound) throw new Error("Usuario no existente.")

    const isValid = await bcrypt.compare(newPassword, userFound.password)

    if (!isValid) throw new Error("Contraseña incorrecta.")

    return {
        username: userFound.username,
        email: userFound.email as Email,
        password: userFound.password
    }
}

export const verifyToLoginCompany = async (object: any): Promise<UserInputs> => {
    const {name, password} = object

    const newName = parseInput(name, "Nombre")
    const newPassword = await parsePassword(password)

    const companyFound = await CompanyModel.findOne({name: newName})

    if (!companyFound) throw new Error("Usuario no existente.")

    const isValid = await bcrypt.compare(newPassword, companyFound.password)

    if (!isValid) throw new Error("Contraseña incorrecta.")

    return {
        username: companyFound.name,
        email: companyFound.email as Email,
        password: companyFound.password
    }
}