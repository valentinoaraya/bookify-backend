import { Request, Response } from "express";
import ServiceModel from "../models/Service";
import CompanyModel from "../models/Company";
import AppointmentModel from "../models/Appointment";
import UserModel from "../models/User";
import { serviceToAdd, serviceToUpdate } from "../utils/verifyData";
import { generateAppointments } from "../utils/generateAppointments";
import moment from "moment-timezone";

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

        const appointmentsToDelete = await AppointmentModel.find({ serviceId: id });

        if (appointmentsToDelete.length > 0) {
            const appointmentIds = appointmentsToDelete.map(app => app._id)
            await AppointmentModel.deleteMany({ _id: { $in: appointmentIds } })
            await CompanyModel.findByIdAndUpdate(service.companyId, {
                $pull: { scheduledAppointments: { $in: appointmentIds } }
            })
            await UserModel.updateMany(
                { appointments: { $in: appointmentIds } },
                { $pull: { appointments: { $in: appointmentIds } } }
            );
        }

        res.send({
            data: "Servicio eliminado",
            serviceId: id,
            appointmentsToDelete: appointmentsToDelete.map(app => app._id)
        }).status(200)

    } catch (error: any) {
        res.send({ error: error.message }).status(500)
    }
}

// Empresa habilita turnos para un servicio

export const enabledAppointments = async (req: Request, res: Response): Promise<void | Response> => {
    try {
        const { id } = req.params
        const { hourStart, hourFinish, turnEach, days } = req.body

        const arrayAppointmentsInString = generateAppointments({
            hourStart,
            hourFinish,
            turnEach,
            days
        })

        const arrayAppointmentsInDate = arrayAppointmentsInString.map(date => {
            const newDate = moment.tz(date, 'YYYY-MM-DD HH:mm', 'America/Argentina/Buenos_Aires')
            return newDate.toDate()
        })

        const updatedService = await ServiceModel.findByIdAndUpdate(id, {
            $push: { availableAppointments: { $each: arrayAppointmentsInDate } }
        }, { new: true }).lean();

        if (!updatedService) return res.send({ error: "Servicio no encontrado" }).status(404);

        res.send({ data: arrayAppointmentsInString }).status(200);

    } catch (error: any) {
        res.send({ error: error.message }).status(500)
    }
}

// Empresa eliminar un turno habilitado

export const deleteEnabledAppointment = async (req: Request, res: Response): Promise<void | Response> => {
    try {
        const { id } = req.params
        const { date } = req.body

        const newDate = moment.tz(date, 'YYYY-MM-DD HH:mm', 'America/Argentina/Buenos_Aires')

        const updatedService = await ServiceModel.findByIdAndUpdate(id, {
            $pull: { availableAppointments: newDate.toDate() }
        }, { new: true }).lean()

        if (!updatedService) return res.send({ error: "Servicio no encontrado." }).status(404)

        const arrayAppointmentsInString = updatedService.availableAppointments.map(date => moment(date).tz('America/Argentina/Buenos_Aires').format('YYYY-MM-DD HH:mm'))

        res.send({ data: arrayAppointmentsInString }).status(200)

    } catch (error: any) {
        res.send({ error: error.message }).status(500)
    }
}

// Usuario realiza una búsqueda de servicio o empresa
export const searchServices = async (req: Request, res: Response): Promise<void | Response> => {
    try {
        const { query } = req.query
        if (!query) return res.send({ message: "Falta el parámetro de búsqueda." })

        const services = await ServiceModel.find({ title: { $regex: query, $options: "i" } })
            .populate({
                path: "companyId",
                model: "Company",
                select: "name email city street number phone"
            }).lean()

        const company = await CompanyModel.findOne({ name: { $regex: query, $options: "i" } });

        if (company) {
            const companyServices = await ServiceModel.find({ companyId: company._id })
                .populate({
                    path: "companyId",
                    model: "Company",
                    select: "name email city street number phone"
                }).lean()

            const companyServicesWithDateInStrings = companyServices.map(service => {
                const availableAppointmentsString = service.availableAppointments.map(date => moment(date).tz('America/Argentina/Buenos_Aires').format('YYYY-MM-DD HH:mm'))
                const scheduledAppointmentsString = service.scheduledAppointments.map(date => moment(date).tz('America/Argentina/Buenos_Aires').format('YYYY-MM-DD HH:mm'))

                return {
                    ...service,
                    availableAppointments: availableAppointmentsString,
                    scheduledAppointments: scheduledAppointmentsString
                }
            })

            return res.send({ data: companyServicesWithDateInStrings }).status(200);
        }

        const servicesWithDateInStrings = services.map(service => {
            const availableAppointmentsString = service.availableAppointments.map(date => moment(date).tz('America/Argentina/Buenos_Aires').format('YYYY-MM-DD HH:mm'))
            const scheduledAppointmentsString = service.scheduledAppointments.map(date => moment(date).tz('America/Argentina/Buenos_Aires').format('YYYY-MM-DD HH:mm'))

            return {
                ...service,
                availableAppointments: availableAppointmentsString,
                scheduledAppointments: scheduledAppointmentsString
            }
        })

        res.send({ data: servicesWithDateInStrings }).status(200);

    } catch (error: any) {
        res.send({ error: error.message }).status(500)
    }

}