import { Request, Response } from "express";
import CompanyModel from "../models/Company";
import { companyToAdd, verifyToLoginCompany } from "../utils";

export const getCompanies = async (_req: Request, res: Response): Promise<void> => {
    try{
        const companies = await CompanyModel.find()
        res.send({data: companies}).status(200)
    } catch (error: any) {
        res.send({error: error.message}).status(500)
    }
}

// Registrar

export const createCompany = async (req: Request, res: Response): Promise<void> => {
    try {
        const company = await companyToAdd(req.body)
        const newCompany = new CompanyModel(company)
        const companyFound = await CompanyModel.findOne({name: newCompany.name})

        if (companyFound) throw new Error("Nombre de empresa ya existente")

        await newCompany.save()

        res.send({newCompany}).status(201)

    } catch (error: any) {
        res.send({error: error.message}).status(400)
    }
}

// Loguear

export const loginCompany = async (req: Request, res: Response): Promise<void> => {
    try{
        const company = await verifyToLoginCompany(req.body)
        res.send({data: {
            companyName: company.username,
            email: company.email
        }})
        .status(200)
    } catch(error: any) {
        res.send({error: error.message}).status(400)
    }
}
