import { Request, Response } from "express";
import CompanyModel from "../models/Company";
import { companyToAdd, verifyToLoginCompany } from "../utils";
import { createToken } from "../middlewares/verifyTokens";

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
        const companyFound = await CompanyModel.findOne({email: newCompany.email})

        if (companyFound) throw new Error("Ya existe una empresa con este email.")

        await newCompany.save()
        res.send({data: newCompany}).status(201)

    } catch (error: any) {
        res.send({error: error.message}).status(400)
    }
}

// Loguear

export const loginCompany = async (req: Request, res: Response): Promise<void> => {
    try{
        const company = await verifyToLoginCompany(req.body)
        const token = createToken(company)
        res
          .cookie("acces_token", token, {
            httpOnly: true, // Solo leer en el servidor
            maxAge: 1000 * 60 * 60 // 1 hora de vida
          })
          .send({data: { companyName: company.name, email: company.email }})
          .status(200)
    } catch(error: any) {
        res.send({error: error.message}).status(400)
    }
}
