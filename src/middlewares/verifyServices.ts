// Middleware para verificar que el servicio que se va a eliminar pertenece a la empresa que envía la solicitud
import { NextFunction, Request, Response } from "express";
import CompanyModel from "../models/Company";

const verifyService = async (req: Request, res: Response, next: NextFunction): Promise<void | Response> => {
    try {
        const { id } = req.params
        const company = req.company

        const companyFromMongoDB = await CompanyModel.findById(company?.id)

        if (!companyFromMongoDB) return res.status(400).send({ error: "Empresa no encontrada" })

        const arrayServices = companyFromMongoDB.services.map(idService => idService.toString())

        if (!arrayServices.includes(id)) return res.status(404).send({ error: "La empresa no contiene este servicio." })

        next()
    } catch (error: any) {
        return res.status(500).send({ error: error.message })
    }

}

export default verifyService