import { Request, Response } from "express"
import { asyncHandler, NotFoundError, UnauthorizedError } from "../../shared/errors"
import { AppointmentMapper } from "./appointment.mapper"
import { AppointmentService } from "./appointment.service"
import { AppointmentUserData } from "./appointment.types"
import { resolveAppointmentRef } from "./cancel-token"

export class AppointmentController {
    constructor(private readonly appointmentService: AppointmentService) {}

    getById = asyncHandler(async (req: Request, res: Response) => {
        const ref = resolveAppointmentRef(req.params.id)
        if (!ref) throw new NotFoundError("No se encontró el turno.")

        const data = await this.appointmentService.getByRef(ref)
        res.status(200).send({ data })
    })

    confirm = asyncHandler(async (req: Request, res: Response) => {
        if (!req.user) throw new UnauthorizedError("Usuario no encontrado.")

        const { date, serviceId, companyId } = req.body.dataAppointment
        const data = await this.appointmentService.confirmAppointment(
            { date, serviceId, companyId },
            req.user as AppointmentUserData
        )
        res.status(200).send({ data })
    })

    confirmFromPaymentWebhook = asyncHandler(async (req: Request, res: Response) => {
        const result = await this.appointmentService.confirmFromPaymentWebhook(req.body)
        res.status(result.status).send(result.body)
    })

    checkOrderTime = asyncHandler(async (req: Request, res: Response) => {
        const data = await this.appointmentService.checkOrderTime(req.body)
        res.status(200).send({ data })
    })

    cancelByClient = asyncHandler(async (req: Request, res: Response) => {
        const ref = resolveAppointmentRef(req.params.id)
        if (!ref) throw new NotFoundError("No se encontró el turno.")

        const data = await this.appointmentService.cancelByClient(
            ref,
            req.body?.dataUser?.email
        )
        res.status(200).send({ data })
    })

    deleteByCompany = asyncHandler(async (req: Request, res: Response) => {
        if (!req.company) throw new UnauthorizedError("Empresa no encontrada.")

        const result = await this.appointmentService.deleteByCompany(
            req.params.id,
            String(req.company.id),
            req.company.name,
            req.company.email
        )

        res.status(200).send({
            data: AppointmentMapper.toDeleteResponse(
                result.appointment,
                result.serviceToSend,
                result.dateInString
            ),
        })
    })

    getCompanyHistory = asyncHandler(async (req: Request, res: Response) => {
        if (!req.company) throw new UnauthorizedError("Empresa no encontrada.")

        const result = await this.appointmentService.getCompanyHistory(
            String(req.company.id),
            req.query as Record<string, string>
        )
        res.status(200).send(result)
    })

    finish = asyncHandler(async (req: Request, res: Response) => {
        if (!req.company) throw new UnauthorizedError("Empresa no encontrada.")

        const data = await this.appointmentService.finish(
            req.params.id,
            String(req.company.id)
        )
        res.status(200).send({ data })
    })

    changeStatus = asyncHandler(async (req: Request, res: Response) => {
        if (!req.company) throw new UnauthorizedError("Empresa no encontrada.")

        const data = await this.appointmentService.changeStatus(
            req.body,
            String(req.company.id)
        )
        res.status(200).send({ data })
    })
}
