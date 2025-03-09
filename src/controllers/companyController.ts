import { Request, Response } from "express";
import CompanyModel from "../models/Company";
import { createToken, companyToAdd, companyToSend, verifyToLoginCompany } from "../utils/verifyData";
import ServiceModel from "../models/Service";
import { Email } from "../types";

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
                type: "company",
                _id: newCompany._id,
                name: newCompany.name,
                phone: newCompany.phone,
                email: newCompany.email,
                city: newCompany.city,
                street: newCompany.street,
                number: newCompany.number,
                scheduledAppointments: newCompany.scheduledAppointments,
                services: newCompany.services,
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

// Obtener servicios de una empresa

export const getAppointmentsServices = async (req: Request, res: Response): Promise<void | Response> => {
    try {
        const { id } = req.params

        const company = await CompanyModel.findById(id).populate("services")

        if (!company) return res.send({ error: "Empresa no encontrada" }).status(404)

        res.send({
            data: {
                services: company.services,
                scheduledAppointments: company.scheduledAppointments
            }
        }).status(200)

    } catch (error: any) {
        res.send({ error: error.message }).status(500)
    }
}