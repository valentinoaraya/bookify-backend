import { Request, Response } from "express";
import ServiceModel from "../models/Service";
import CompanyModel from "../models/Company";
import AppointmentModel from "../models/Appointment";
import { serviceToAdd, serviceToUpdate } from "../utils/verifyData";
import { generateAppointments } from "../utils/generateAppointments";
import moment from "moment-timezone";

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

        res.status(200).send({ data: savedService })
    } catch (error: any) {
        res.status(500).send({ error: error.message })
    }
}

export const editService = async (req: Request, res: Response): Promise<Response | void> => {
    try {
        const { id } = req.params
        const serviceBeforeUpdate = await ServiceModel.findById(id).lean()
        if (!serviceBeforeUpdate) return res.status(404).send({ error: "Servicio no encontrado" })
        const fieldsToUpdate = serviceToUpdate(req.body)

        if (serviceBeforeUpdate.capacityPerShift !== fieldsToUpdate.capacityPerShift) {
            const availableAppointmentsUpdated = serviceBeforeUpdate.availableAppointments.map(app => ({
                ...app,
                capacity: fieldsToUpdate.capacityPerShift,
            }))

            if (serviceBeforeUpdate.capacityPerShift < fieldsToUpdate.capacityPerShift) {
                const noAvailablesAppointments: Date[] = []
                serviceBeforeUpdate.scheduledAppointments.forEach(date => {
                    if (!availableAppointmentsUpdated.some(item => item.datetime.getTime() === date.getTime()) && !noAvailablesAppointments.some(d => d.getTime() === date.getTime())) {
                        noAvailablesAppointments.push(date)
                    }
                })
                const newAvailableAppointments = noAvailablesAppointments.map(date => {
                    const count = serviceBeforeUpdate.scheduledAppointments.filter(d => d.getTime() === date.getTime()).length
                    return {
                        datetime: date,
                        capacity: fieldsToUpdate.capacityPerShift,
                        taken: count
                    }
                })

                fieldsToUpdate.availableAppointments = [...availableAppointmentsUpdated, ...newAvailableAppointments]
            }

            if (serviceBeforeUpdate.capacityPerShift > fieldsToUpdate.capacityPerShift) {
                const newAvailableAppointments = availableAppointmentsUpdated.filter(app => app.taken < fieldsToUpdate.capacityPerShift)
                fieldsToUpdate.availableAppointments = newAvailableAppointments
            }
        }

        const service = await ServiceModel.findByIdAndUpdate(id,
            { $set: fieldsToUpdate },
            { new: true }
        ).lean()
        if (!service) return res.status(404).send({ error: "Servicio no encontrado" })

        const availableAppointmentsToSend = service.availableAppointments.map(appointment => {
            return {
                ...appointment,
                datetime: moment(appointment.datetime).tz('America/Argentina/Buenos_Aires').format('YYYY-MM-DD HH:mm')
            }
        })

        const scheduledAppointmentsToSend = service.scheduledAppointments.map(date => moment(date).tz('America/Argentina/Buenos_Aires').format('YYYY-MM-DD HH:mm'))

        res.status(200).send({ data: { ...service, availableAppointments: availableAppointmentsToSend, scheduledAppointments: scheduledAppointmentsToSend } })

    } catch (error: any) {
        res.status(500).send({ error: error.message })
    }
}

export const deleteService = async (req: Request, res: Response): Promise<void | Response> => {
    try {
        const { id } = req.params
        const service = await ServiceModel.findByIdAndDelete(id)

        if (!service) return res.status(404).send({ error: "Servicio no encontrado." })

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
        }

        res.status(200).send({
            data: "Servicio eliminado",
            serviceId: id,
            appointmentsToDelete: appointmentsToDelete.map(app => app._id)
        })

    } catch (error: any) {
        res.status(500).send({ error: error.message })
    }
}

export const enabledAppointments = async (req: Request, res: Response): Promise<void | Response> => {
    try {
        const { id } = req.params
        const { hourStart, hourFinish, turnEach, days } = req.body
        const service = await ServiceModel.findById(id)

        if (!service) return res.send({ error: "Servicio no encontrado" })

        const arrayAppointmentsInString = generateAppointments({
            hourStart,
            hourFinish,
            turnEach,
            days,
            capacityPerShift: service.capacityPerShift
        })

        const arrayAppointmentsInDate = arrayAppointmentsInString.map(appointment => {
            const newDate = moment.tz(appointment.datetime, 'YYYY-MM-DD HH:mm', 'America/Argentina/Buenos_Aires')
            return {
                ...appointment,
                datetime: newDate.toDate(),
            }
        })

        const updatedService = await ServiceModel.findByIdAndUpdate(id, {
            $push: { availableAppointments: { $each: arrayAppointmentsInDate } }
        }, { new: true }).lean();

        if (!updatedService) return res.status(404).send({ error: "Servicio no encontrado" });

        res.status(200).send({ data: arrayAppointmentsInString });

    } catch (error: any) {
        res.status(500).send({ error: error.message })
    }
}

export const deleteEnabledAppointment = async (req: Request, res: Response): Promise<void | Response> => {
    try {
        const { id } = req.params
        const { date } = req.body

        const newDate = moment.tz(date, 'YYYY-MM-DD HH:mm', 'America/Argentina/Buenos_Aires')

        const updatedService = await ServiceModel.findByIdAndUpdate(id, {
            $pull: { availableAppointments: { datetime: newDate.toDate() } }
        }, { new: true }).lean()

        if (!updatedService) return res.status(404).send({ error: "Servicio no encontrado." })

        const arrayAppointmentsInString = updatedService.availableAppointments.map(appointment => {
            return {
                ...appointment,
                datetime: moment(appointment.datetime).tz('America/Argentina/Buenos_Aires').format('YYYY-MM-DD HH:mm')
            }
        })

        res.status(200).send({ data: arrayAppointmentsInString })

    } catch (error: any) {
        res.status(500).send({ error: error.message })
    }
}