import { Request, Response } from "express";
import ServiceModel from "../models/Service";
import CompanyModel from "../models/Company";
import { serviceToAdd, serviceToUpdate } from "../utils";

// Empresa crea un nuevo servicio
export const createService = async (req: Request, res: Response) => {
    try {
        const companyId = req.company?.id
        const service = serviceToAdd(req.body)
        const newService = { companyId, ...service }
        const finalService = new ServiceModel(newService)

        const savedService = await finalService.save()

        await CompanyModel.findByIdAndUpdate(companyId, {
            $push: { services: savedService._id }
        })

        res.send({ data: savedService }).status(200)
    } catch (error: any) {
        res.send({ error: error.message }).status(500)
    }
}

// Empresa edita un servicio
export const editService = async (req: Request, res: Response): Promise<Response | void> => {
    try {
        const { id } = req.params
        const fieldsToUpdate = serviceToUpdate(req.body)
        const service = await ServiceModel.findByIdAndUpdate(id,
            { $set: fieldsToUpdate },
            { new: true }
        )

        if (!service) return res.send({ error: "Servicio no encontrado" }).status(404)

        res.send({ data: service }).status(200)

    } catch (error: any) {
        res.send({ error: error.message }).status(500)
    }
}

// Empresa elimina un servicio
export const deleteService = async (req: Request, res: Response): Promise<void | Response> => {
    try {
        const { id } = req.params
        const service = await ServiceModel.findByIdAndDelete(id)

        if (!service) return res.send({ error: "Servicio no encontrado." }).status(404)

        await CompanyModel.findByIdAndUpdate(service.companyId, {
            $pull: { services: id }
        })

        res.send({ data: "Servicio eliminado" }).status(200)

    } catch (error: any) {
        res.send({ error: error.message }).status(500)
    }
}