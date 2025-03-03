import CompanyModel from "./models/Company";
import UserModel from "./models/User";
import { BasicInfoWithID, BasicInfoWithIDRole, CompanyInputs, CompanyWithoutPassword, Email, Service, UserInputAppointment, UserInputs } from "./types";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken"
import { JWT_KEY } from "./config";
import moment from "moment";

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
        name: `${userFound.name} ${userFound.lastName}`,
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

// Generar turnos
export const generateAppointments = (body: {
    hourStart: string,
    hourFinish: string,
    turnEach: string,
    days: string[]
}): string[] => {
    const { hourStart, hourFinish, turnEach, days } = body;
    const turnEachMinutes = parseInt(turnEach, 10);
    const availableAppointments: string[] = [];
    days.forEach((day) => {
        let currentTime = moment(day).set({
            hour: parseInt(hourStart.split(":")[0]),
            minute: parseInt(hourStart.split(":")[1]),
        });
        const endTime = moment(day).set({
            hour: parseInt(hourFinish.split(":")[0]),
            minute: parseInt(hourFinish.split(":")[1]),
        });

        while (currentTime.isBefore(endTime) || currentTime.isSame(endTime)) {
            availableAppointments.push(currentTime.format("YYYY-MM-DD HH:mm"));
            currentTime.add(turnEachMinutes, "minutes");
        }
    });

    return availableAppointments;
};

// Cuerpos de emails
export const emailConfirmAppointmentUser = (user: string, service: string, company: string, location: string, date: string, time: string) => {
    return `<h2>Turno confimado con éxito</h2>
    <p>Hola ${user.split(" ")[0]}, te informamos que tu turno para ${service} en ${company} fue confirmado.</p>
    <p>Se te espera en ${location} el día ${date} a las ${time} hs.</p>`
}

export const emailConfirmAppointmentCompany = (company: string, service: string, user: string, date: string, time: string) => {
    return `<h2>Tienes un nuevo turno</h2>
    <p>Hola ${company}, te informamos que ${user} ha agendado un nuevo turno para ${service}.</p>
    <p>El turno fue agendado para el día ${date} a las ${time} hs.</p>
    <p>Puedes ver la información completa en el panel "Prócimos turnos" en Bookify.</p>`
}

export const emailCancelAppointmentUser = (company: string, user: string, service: string, date: string, time: string) => {
    return `<h2>Turno cancelado</h2>
    <p>Hola ${user}, el turno que tenías para ${service} en ${company} se ha cancelado correctamente.</p>
    <p>El turno estaba agendado para el día ${date} a las ${time} hs. Ahora el turno pasa a estar disponible nuevamente.</p>`
}

export const emailCancelAppointmentCompany = (company: string, user: string, service: string, date: string, time: string) => {
    return `<h2>Un turno ha sido cancelado</h2>
    <p>Hola ${company}, el usuario ${user} ha cancelado el turno que tenía para ${service}.</p>
    <p>El turno estaba agendado para el día ${date} a las ${time} hs. Ahora el turno pasa a estar disponible nuevamente.</p>`
}

export const emailDeleteAppointmentUser = (company: string, user: string, service: string, date: string, time: string) => {
    return `<h2>Tu turno ha sido cancelado</h2>
    <p>Hola ${user.split(" ")[0]}, el turno que tenías para ${service} ha sido cancelado por ${company}.</p>
    <p>El turno estaba agendado para el día ${date} a las ${time} hs. Ahora el turno pasa a estar disponible nuevamente.</p>`
}

export const emailDeleteAppointmentCompany = (company: string, user: string, service: string, date: string, time: string) => {
    return `<h2>Turno cancelado</h2>
    <p>Hola ${company}, el turno que ${user} tenía para ${service} ha sido cancelado correctamente.</p>
    <p>El turno estaba agendado para el día ${date} a las ${time} hs. Ahora el turno pasa a estar disponible nuevamente.</p>`
}