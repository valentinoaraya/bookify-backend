import { Request, Response } from "express";
import CompanyModel from "../models/Company";
import { companyToAdd, companyToSend, verifyToLoginCompany } from "../utils";
import { createToken } from "../utils";
import ServiceModel from "../models/Service";
import { Email } from "../types";

export const getCompanies = async (_req: Request, res: Response): Promise<void> => {
    try {
        const companies = await CompanyModel.find()
        res.send({ data: companies }).status(200)
    } catch (error: any) {
        res.send({ error: error.message }).status(500)
    }
}

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

        res
            .cookie("acces_token", token, {
                httpOnly: true, // Solo leer en el servidor
                maxAge: 1000 * 60 * 60, // 1 hora de vida
                sameSite: "lax"
            })
            .send({
                data: {
                    id: newCompany.id,
                    name: newCompany.name,
                    email: newCompany.email
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
        res
            .cookie("acces_token", token, {
                httpOnly: true, // Solo leer en el servidor
                maxAge: 1000 * 60 * 60, // 1 hora de vida
                sameSite: "lax"
            })
            .send({ data: company })
            .status(200)
    } catch (error: any) {
        res.send({ error: error.message }).status(400)
    }
}

// Obtener empresas y servicios

export const getCompaniesServices = async (req: Request, res: Response): Promise<void> => {
    const searchTerm = req.query.q as string || ''
    try {

        const companies = await CompanyModel.find({
            name: { $regex: searchTerm, $options: 'i' }
        })

        const services = await ServiceModel.find({
            title: { $regex: searchTerm, $options: 'i' }
        })

        res.send(searchTerm ? { data: { companies, services } } : { error: "No encontrado" })

    } catch (error: any) {
        res.send({ error: error }).status(500)
    }
}

export const getCompanyById = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params
    try {
        const company = await companyToSend(id)

        res.send({ data: company }).status(200)

    } catch (error: any) {
        res.send({ error: error.message }).status(500)
    }
}

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
            })

        if (!newCompany) return res.send({ error: "No se encontró empresa." }).status(400)

        res.send({
            data: {
                name: newCompany.name,
                phone: newCompany.phone,
                email: newCompany.email,
                city: newCompany.city,
                street: newCompany.street,
                number: newCompany.number,
                scheduledAppointments: newCompany.scheduledAppointments,
                services: newCompany.services,
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

// Logout

export const logoutCompany = async (_req: Request, res: Response): Promise<void> => {
    res.clearCookie("acces_token").send({ data: "Sesión cerrada" }).status(200)
}