import { Request, Response } from "express";
import CompanyModel from "../models/Company";
import { createToken, companyToAdd, verifyToLoginCompany } from "../utils/verifyData";
import { type PopulatedAppointment, type Email, type ServiceWithAppointments } from "../types";
import moment from "moment-timezone";

// Registrar

export const createCompany = async (req: Request, res: Response): Promise<void> => {
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

        res.send({
            data: {
                id: newCompany.id,
                name: newCompany.name,
                email: newCompany.email,
                access_token: token
            }
        })
            .status(200)

    } catch (error: any) {
        res.send({ error: error.message }).status(400)
    }
}

// Loguear

export const loginCompany = async (req: Request, res: Response): Promise<void> => {
    try {
        const company = await verifyToLoginCompany(req.body)
        const token = createToken(company)
        res.send({ data: { ...company, access_token: token } }).status(200)
    } catch (error: any) {
        res.send({ error: error.message }).status(400)
    }
}

// Obtener empresa

export const getCompany = async (req: Request, res: Response): Promise<void | Response> => {
    try {

        const company = req.company

        const newCompany = await CompanyModel.findById(company?.id)
            .populate("services")
            .populate({
                path: "scheduledAppointments",
                populate: [
                    { path: "serviceId", model: "Service" },
                    {
                        path: "clientId",
                        model: "User",
                        select: "name lastName email phone"
                    }
                ]
            }).lean()

        if (!newCompany) return res.send({ error: "No se encontró empresa." }).status(400)

        const scheduledAppointmentsCompany = newCompany.scheduledAppointments as unknown as PopulatedAppointment[]
        const servicesCompany = newCompany.services as unknown as ServiceWithAppointments[]

        const scheduledAppointmentsWithDateInString = scheduledAppointmentsCompany.map(app => {
            const dateInString = moment(app.date).tz('America/Argentina/Buenos_Aires').format('YYYY-MM-DD HH:mm')
            return { ...app, date: dateInString }
        })

        const servicesCompanyWithDateInString = servicesCompany.map(service => {
            const newAvailableAppointments = service.availableAppointments.map(date => moment(date).tz('America/Argentina/Buenos_Aires').format('YYYY-MM-DD HH:mm'))
            const newScheduledAppointments = service.scheduledAppointments.map(date => moment(date).tz('America/Argentina/Buenos_Aires').format('YYYY-MM-DD HH:mm'))

            return {
                ...service,
                availableAppointments: newAvailableAppointments,
                scheduledAppointments: newScheduledAppointments
            }
        })

        res.send({
            data: {
                type: "company",
                _id: newCompany._id,
                name: newCompany.name,
                phone: newCompany.phone,
                email: newCompany.email,
                city: newCompany.city,
                street: newCompany.street,
                number: newCompany.number,
                scheduledAppointments: scheduledAppointmentsWithDateInString,
                services: servicesCompanyWithDateInString,
                connectedWithMP: newCompany.connectedWithMP
            }
        })

    } catch (error: any) {
        res.send({ error: error.message }).status(500)
    }
}

// Actualizar

export const updateCompany = async (req: Request, res: Response): Promise<void | Response> => {
    try {
        const company = req.company
        const data = req.body
        const updatedCompany = await CompanyModel.findByIdAndUpdate(
            company?.id,
            { $set: data },
            { new: true }
        )

        if (!updatedCompany) return res.send({ error: "No se encontró la empresa" }).status(400)

        const fullData = {
            type: "company",
            name: updatedCompany.name,
            email: updatedCompany.email,
            phone: updatedCompany.phone,
            city: updatedCompany.city,
            street: updatedCompany.street,
            number: updatedCompany.number
        }

        res.send({ data: fullData }).status(200)
    } catch (error: any) {
        res.send({ error: error.message }).status(500)
    }
}