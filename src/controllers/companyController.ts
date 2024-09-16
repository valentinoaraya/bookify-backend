import { Request, Response } from "express";
import CompanyModel from "../models/Company";
import { companyToAdd, companyToSend, verifyToLoginCompany } from "../utils";
import { createToken } from "../utils";
import ServiceModel from "../models/Service";

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
        res.send({ data: "Empresa registrada con éxito." }).status(201)

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
            .send({ data: { companyName: company.name, email: company.email } })
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