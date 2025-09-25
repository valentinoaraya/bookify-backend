import { Request, Response } from "express";
import CompanyModel from "../models/Company";
import { createToken, companyToAdd, verifyToLoginCompany } from "../utils/verifyData";
import { type Email } from "../types";
import moment from "moment-timezone";
import { ADMIN_API_KEY } from "../config";

export const createCompany = async (req: Request, res: Response): Promise<void | Response> => {

    const apiKey = req.headers["admin-api-key"]

    if (!apiKey || apiKey !== ADMIN_API_KEY) return res.status(401).send({ error: "No tienes permisos para realizar esta acción." })

    try {
        const company = await companyToAdd(req.body)
        const newCompany = new CompanyModel(company)
        const companyFound = await CompanyModel.findOne({ email: newCompany.email })

        if (companyFound) throw new Error("Ya existe una empresa con este email.")

        await newCompany.save()
        const token = createToken({
            id: newCompany.id,
            name: newCompany.name,
            email: newCompany.email as Email
        })

        res.status(200).send({
            data: {
                id: newCompany.id,
                name: newCompany.name,
                email: newCompany.email,
                access_token: token
            }
        })


    } catch (error: any) {
        res.status(400).send({ error: error.message })
    }
}

export const loginCompany = async (req: Request, res: Response): Promise<void> => {
    try {
        const company = await verifyToLoginCompany(req.body)
        const token = createToken(company)
        res.status(200).send({ data: { ...company, access_token: token } })
    } catch (error: any) {
        res.status(400).send({ error: error.message })
    }
}

export const getCompany = async (req: Request, res: Response): Promise<void | Response> => {
    try {
        const company = req.company

        const companyDB = await CompanyModel.findById(company?.id)
            .populate("services")
            .populate("reminders.services", "title")
            .populate("scheduledAppointments")
            .lean()

        if (!companyDB) return res.status(400).send({ error: "No se encontró la empresa" })

        const servicesCompanyWithDateInString = companyDB.services.map((service: any) => ({
            ...service,
            availableAppointments: service.availableAppointments?.map((appointment: any) => ({
                ...appointment,
                datetime: moment(appointment.datetime).tz('America/Argentina/Buenos_Aires').format('YYYY-MM-DD HH:mm')
            })),
            pendingAppointments: service.pendingAppointments?.map((pending: any) => ({
                ...pending,
                datetime: moment(pending.datetime).tz('America/Argentina/Buenos_Aires').format('YYYY-MM-DD HH:mm')
            })),
            scheduledAppointments: service.scheduledAppointments?.map((date: any) => moment(date).tz('America/Argentina/Buenos_Aires').format('YYYY-MM-DD HH:mm'))
        }))

        const scheduledAppointmentsWithDateInString = companyDB.scheduledAppointments.map((app: any) => ({
            ...app,
            date: moment(app.date).tz('America/Argentina/Buenos_Aires').format('YYYY-MM-DD HH:mm')
        }))

        return res.status(200).send({
            data: {
                type: "company",
                _id: companyDB._id,
                name: companyDB.name,
                phone: companyDB.phone,
                email: companyDB.email,
                city: companyDB.city,
                street: companyDB.street,
                number: companyDB.number,
                scheduledAppointments: scheduledAppointmentsWithDateInString,
                reminders: companyDB.reminders,
                services: servicesCompanyWithDateInString,
                connectedWithMP: companyDB.connectedWithMP,
                company_id: companyDB.company_id,
                cancellationAnticipationHours: companyDB.cancellationAnticipationHours,
                bookingAnticipationHours: companyDB.bookingAnticipationHours
            }
        })

    } catch (error: any) {
        res.status(500).send({ error: error.message })
    }
}

export const updateCompany = async (req: Request, res: Response): Promise<void | Response> => {
    try {
        const company = req.company
        const data = req.body

        const cleanedData = {
            name: (data.name as string)?.trim(),
            phone: (data.phone as string)?.trim(),
            email: (data.email as string)?.trim(),
            city: (data.city as string)?.trim(),
            street: (data.street as string)?.trim(),
            number: data.number,
            company_id: (data.company_id as string)?.trim(),
            reminders: data.reminders,
            cancellationAnticipationHours: typeof data.cancellationAnticipationHours === 'number' ? data.cancellationAnticipationHours : undefined,
            bookingAnticipationHours: typeof data.bookingAnticipationHours === 'number' ? data.bookingAnticipationHours : undefined,
        }

        const cleanedSet: any = {}
        Object.entries(cleanedData).forEach(([key, value]) => {
            if (value !== undefined) cleanedSet[key] = value
        })

        const updatedCompany = await CompanyModel.findByIdAndUpdate(
            company?.id,
            { $set: cleanedSet },
            { new: true }
        ).populate("reminders.services", "title").lean()

        if (!updatedCompany) return res.status(400).send({ error: "No se encontró la empresa" })

        const fullData = {
            type: "company",
            name: updatedCompany.name,
            company_id: updatedCompany.company_id,
            email: updatedCompany.email,
            phone: updatedCompany.phone,
            city: updatedCompany.city,
            street: updatedCompany.street,
            number: updatedCompany.number,
            reminders: updatedCompany.reminders,
            cancellationAnticipationHours: updatedCompany.cancellationAnticipationHours,
            bookingAnticipationHours: updatedCompany.bookingAnticipationHours,
        }

        res.status(200).send({ data: fullData })
    } catch (error: any) {
        res.status(500).send({ error: error.message })
    }
}

export const getCompanyToUser = async (req: Request, res: Response): Promise<void | Response> => {
    try {
        const companyId = req.params.company_id
        const company = await CompanyModel.findOne({ company_id: companyId })
            .populate("services")
            .lean()

        if (!company) return res.status(400).send({ error: "Empresa no encontrada." })

        res.status(200).send({ data: company })

    } catch (error: any) {
        res.status(500).send({ error: error.message })
    }
}