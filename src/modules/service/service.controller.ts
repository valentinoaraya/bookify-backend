import { Request, Response, NextFunction } from "express"
import { asyncHandler, UnauthorizedError } from "../../shared/errors"
import { ServiceService } from "./service.service"

export class ServiceController {
    constructor(private readonly serviceService: ServiceService) {}

    create = asyncHandler(async (req: Request, res: Response) => {
        if (!req.company) throw new UnauthorizedError("Empresa no encontrada.")
        const data = await this.serviceService.create(req.company.id, req.body)
        res.status(200).send({ data })
    })

    getById = asyncHandler(async (req: Request, res: Response) => {
        const data = await this.serviceService.getById(req.params.id)
        res.status(200).send({ data })
    })

    containsSignPrice = asyncHandler(async (req: Request, res: Response) => {
        const data = await this.serviceService.containsSignPrice(req.params.id)
        res.status(200).send({ data })
    })

    edit = asyncHandler(async (req: Request, res: Response) => {
        const data = await this.serviceService.update(req.params.id, req.body)
        res.status(200).send({ data })
    })

    delete = asyncHandler(async (req: Request, res: Response) => {
        if (!req.company) throw new UnauthorizedError("Empresa no encontrada.")
        const result = await this.serviceService.delete(req.params.id, {
            id: req.company.id,
            name: req.company.name,
            email: req.company.email,
        })
        res.status(200).send(result)
    })

    enableSlots = asyncHandler(async (req: Request, res: Response) => {
        const data = await this.serviceService.enableSlots(req.params.id, req.body)
        res.status(200).send({ data })
    })

    addEnableAppointment = asyncHandler(async (req: Request, res: Response) => {
        const data = await this.serviceService.addEnableAppointment(
            req.params.id,
            req.body.date
        )
        res.status(200).send({ data })
    })

    deleteEnabledAppointment = asyncHandler(async (req: Request, res: Response) => {
        const data = await this.serviceService.deleteEnabledAppointment(
            req.params.id,
            req.body.date,
            req.body.all
        )
        res.status(200).send({ data })
    })
}

export const createVerifyServiceMiddleware = (serviceService: ServiceService) => {
    return asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
        if (!req.company) throw new UnauthorizedError("Usuario no autorizado")
        await serviceService.assertCompanyOwnsService(req.company.id, req.params.id)
        next()
    })
}
