import { Request, Response } from "express";
import CompanyModel from "../models/Company";
import { createTokens, verifyToLoginCompany, companyToAdd } from "../utils/verifyData";
import { type Email } from "../types";
import moment from "moment-timezone";
import { PreApproval } from "mercadopago";
import { mercadoPagoAedes } from "../services/mercadopagoService";
import { BACK_URL_AEDES } from "../config";

export const createCompany = async (req: Request, res: Response): Promise<void | Response> => {
    try {
        const company = await companyToAdd(req.body)

        const namesAndAmounts = {
            individual: {
                name: "Plan Individual",
                price: 12000
            },
            individual_plus: {
                name: "Plan Individual Plus",
                price: 18000
            },
            teams: {
                name: "Plan Equipo",
                price: 35000
            },
        }

        const newCompany = new CompanyModel(company)
        const companyFound = await CompanyModel.findOne({ email: newCompany.email })

        if (companyFound) throw new Error("Ya existe una empresa con este email.")

        await newCompany.save()
        const tokens = createTokens({
            id: newCompany.id,
            name: newCompany.name,
            email: newCompany.email as Email
        })

        await CompanyModel.findByIdAndUpdate(newCompany.id, {
            refresh_token: tokens.refresh_token
        })

        const suscription = await new PreApproval(mercadoPagoAedes).create({
            body: {
                back_url: BACK_URL_AEDES,
                reason: `Suscripción Bookify - ${namesAndAmounts[company.plan as keyof typeof namesAndAmounts].name}`,
                auto_recurring: {
                    frequency: 1,
                    frequency_type: "months",
                    transaction_amount: namesAndAmounts[company.plan as keyof typeof namesAndAmounts].price,
                    currency_id: "ARS"
                },
                payer_email: company.email,
                status: "pending",
                external_reference: `${newCompany.id}`
            }
        })

        res.status(200).send({
            data: {
                init_point: suscription.init_point,
                id: newCompany.id,
                name: newCompany.name,
                email: newCompany.email,
                access_token: tokens.access_token,
                refresh_token: tokens.refresh_token
            }
        })


    } catch (error: any) {
        res.status(400).send({ error: error.message })
    }
}

export const loginCompany = async (req: Request, res: Response): Promise<void> => {
    try {
        const company = await verifyToLoginCompany(req.body)
        const tokens = createTokens(company)

        await CompanyModel.findByIdAndUpdate(company.id, {
            refresh_token: tokens.refresh_token
        })

        res.status(200).send({
            data: {
                ...company,
                access_token: tokens.access_token,
                refresh_token: tokens.refresh_token
            }
        })
    } catch (error: any) {
        res.status(400).send({ error: error.message })
    }
}

export const getCompany = async (req: Request, res: Response): Promise<void | Response> => {
    try {
        const company = req.company

        const companyDB = await CompanyModel.findById(company?.id)
            .populate("services")
            .populate({
                path: "scheduledAppointments",
                populate: [
                    { path: "serviceId", model: "Service" },
                ]
            })
            .populate("reminders.services", "title")
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
                reminders: companyDB.reminders
                    ?.slice()
                    .sort((a: any, b: any) => {
                        if (typeof a.hoursBefore === "number" && typeof b.hoursBefore === "number") {
                            return a.hoursBefore - b.hoursBefore;
                        }
                        return 0;
                    }),
                services: servicesCompanyWithDateInString,
                connectedWithMP: companyDB.connectedWithMP,
                company_id: companyDB.company_id,
                cancellationAnticipationHours: companyDB.cancellationAnticipationHours,
                bookingAnticipationHours: companyDB.bookingAnticipationHours,
                slotsVisibilityDays: companyDB.slotsVisibilityDays,
                plan: companyDB.plan
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
            slotsVisibilityDays: typeof data.slotsVisibilityDays === 'number' ? data.slotsVisibilityDays : undefined,
        }

        const cleanedSet: any = {}
        Object.entries(cleanedData).forEach(([key, value]) => {
            if (value !== undefined) cleanedSet[key] = value
        })

        if (cleanedSet.company_id) {
            const existingCompany = await CompanyModel.findOne({ company_id: cleanedSet.company_id, _id: { $ne: company?.id } });
            if (existingCompany) {
                return res.status(400).send({ error: "El company_id ya está en uso por otra empresa." });
            }
        }

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
            reminders: updatedCompany.reminders
                ?.slice()
                .sort((a: any, b: any) => {
                    if (typeof a.hoursBefore === "number" && typeof b.hoursBefore === "number") {
                        return a.hoursBefore - b.hoursBefore;
                    }
                    return 0;
                }),
            slotsVisibilityDays: updatedCompany.slotsVisibilityDays,
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

export const refreshToken = async (req: Request, res: Response): Promise<void | Response> => {
    try {
        const company = req.company // Viene del middleware authenticateRefreshTokenCompany

        if (!company) {
            return res.status(401).send({ error: "No se pudo verificar la identidad de la empresa" })
        }

        // Generar nuevos tokens
        const tokens = createTokens({
            id: company.id,
            name: company.name,
            email: company.email
        })

        // Actualizar el refresh token en la base de datos
        await CompanyModel.findByIdAndUpdate(company.id, {
            refresh_token: tokens.refresh_token
        })

        res.status(200).send({
            data: {
                access_token: tokens.access_token,
                refresh_token: tokens.refresh_token
            }
        })

    } catch (error: any) {
        res.status(500).send({ error: error.message })
    }
}

export const logoutCompany = async (req: Request, res: Response): Promise<void | Response> => {
    try {
        const company = req.company // Viene del middleware authenticateTokenCompany

        if (!company) {
            return res.status(401).send({ error: "No se pudo verificar la identidad de la empresa" })
        }

        // Invalidar el refresh token eliminándolo de la base de datos
        await CompanyModel.findByIdAndUpdate(company.id, {
            refresh_token: ""
        })

        res.status(200).send({
            message: "Logout exitoso"
        })

    } catch (error: any) {
        res.status(500).send({ error: error.message })
    }
}