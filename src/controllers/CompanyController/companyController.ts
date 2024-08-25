import { Request, Response } from "express";
import CompanyModel from "../../models/Company";
import { companyToAdd } from "./utilsCompany";

export const createCompany = async (req: Request, res: Response): Promise<void> => {
    try {
        const company = companyToAdd(req.body)
        const newCompany = new CompanyModel(company)

        await newCompany.save()

        res.send({newCompany}).status(201)

    } catch (error: any) {
        res.send({error: error.message}).status(400)
    }

}

export const getCompanies = async (_req: Request, res: Response): Promise<void> => {
    try{
        const companies = await CompanyModel.find()
        res.send({data: companies}).status(200)
    } catch (error: any) {
        res.send({error: error.message}).status(500)
    }
}

