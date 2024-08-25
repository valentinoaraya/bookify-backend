import { CompanyInputs, Email } from "../../types";

const isString = (param: any): boolean => {
    return (typeof param === "string" || param instanceof String)
}

const isEmail = (param: any): boolean => {
    if (typeof param != "string"){
        return false        
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(param);
}

const parseInput = (input: any, nameInput: string): string => {
    if (!isString(input)){
        throw new Error(`${nameInput} incorrecto o incompleto.`)
    }
    return input
}

const parseEmail = (emailFromRequest: any): Email => {
    if (!isEmail(emailFromRequest)){
        throw new Error("Email incorrecto o incompleto.")
    }

    return emailFromRequest
}

export const companyToAdd = (object: any): CompanyInputs => {
    const newCompany: CompanyInputs = {
        name: parseInput(object.name, "Nombre"),
        email: parseEmail(object.email),
        password: parseInput(object.password, "Contraseña"),
        location: parseInput(object.location, "Ubicación")
    }
    
    return newCompany
}
