import { Request, Response } from "express";
import ServiceModel from "../models/Service";
import CompanyModel from "../models/Company";
import AppointmentModel from "../models/Appointment";
import { serviceToAdd, serviceToUpdate } from "../utils/verifyData";
import { generateAppointments } from "../utils/generateAppointments";
import moment from "moment-timezone";
import { AvailableAppointment, ServiceWithAppointments } from "../types";
import { deleteAppointmentProcess } from "./appointmentController";

export const createService = async (req: Request, res: Response): Promise<void | Response> => {
    try {
        const companyId = req.company?.id

        const companyDb = await CompanyModel.findById(companyId)

        if (!companyDb) return res.status(404).send({ error: "Empresa no encontrada." })

        if (companyDb.suscription?.plan === "individual" && companyDb.services.length >= 5) {
            return res.status(403).send({ error: "Has alcanzado el límite de servicios para tu plan. Actualiza tu plan para agregar más servicios." })
        }

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

export const getService = async (req: Request, res: Response): Promise<Response | void> => {
    try {
        const { id } = req.params
        const service = await ServiceModel.findById(id).lean()
        if (!service) return res.status(404).send({ error: "Servicio no encontrado." })
        const availableAppointments = service.availableAppointments.map(appointment => ({
            ...appointment,
            datetime: moment(appointment.datetime).tz('America/Argentina/Buenos_Aires').format('YYYY-MM-DD HH:mm')
        }))
        const scheduledAppointments = service.scheduledAppointments.map(date => moment(date).tz('America/Argentina/Buenos_Aires').format('YYYY-MM-DD HH:mm'))
        const pendingAppointments = service.pendingAppointments.map(pendingApp => ({
            ...pendingApp,
            datetime: moment(pendingApp.datetime).tz('America/Argentina/Buenos_Aires').format('YYYY-MM-DD HH:mm')
        }))
        const serviceWithAppointments = {
            ...service,
            availableAppointments,
            scheduledAppointments,
            pendingAppointments
        }
        res.status(200).send({ data: serviceWithAppointments })
    } catch (error: any) {
        res.status(500).send({ error: error.message })
    }
}

export const containsSignPrice = async (req: Request, res: Response): Promise<Response | void> => {
    try {
        const { id } = req.params
        const service = await ServiceModel.findById(id).lean()
        if (!service) return res.status(404).send({ error: "Servicio no encontrado." })
        const containsSignPrice = service.signPrice > 0
        res.status(200).send({ data: { contains: containsSignPrice } })
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
        if (!req.company) return res.status(500).send({ error: "Empresa no encontrada." })
        const { id } = req.params
        const appointmentsToDelete = await AppointmentModel.find({ serviceId: id, status: "scheduled" });

        if (appointmentsToDelete.length > 0) {
            for (const appointment of appointmentsToDelete) {
                await deleteAppointmentProcess(appointment.id, req.company.name, req.company.email)
            }
        }

        const service = await ServiceModel.findById(id).lean()

        if (!service) return res.status(404).send({ error: "Servicio no encontrado." })

        await AppointmentModel.updateMany({ serviceId: id },
            { $set: { serviceInfo: { title: service.title } } }
        )

        const serviceToSend = await ServiceModel.findByIdAndDelete(id)

        if (!serviceToSend) return res.status(404).send({ error: "Servicio no encontrado." })

        await CompanyModel.findByIdAndUpdate(serviceToSend.companyId, {
            $pull: { services: id }
        })

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

export const addEnableAppointment = async (req: Request, res: Response): Promise<void | Response> => {
    try {
        const { id } = req.params
        const { date } = req.body

        const newDate = moment.tz(date, 'YYYY-MM-DD HH:mm', 'America/Argentina/Buenos_Aires').toDate()

        const service = await ServiceModel.findById(id).lean()

        if (!service) return res.status(404).send({ error: "Servicio no encontrado." })

        const appointmentToUpdate = service.availableAppointments.find(app => app.datetime.getTime() === newDate.getTime())

        if (appointmentToUpdate) {
            const availableAppointmentsWithoutNoChangedAppointment = service.availableAppointments.filter(app => app.datetime.getTime() !== appointmentToUpdate.datetime.getTime())
            const updatedAppointment = {
                ...appointmentToUpdate,
                capacity: appointmentToUpdate.capacity + 1
            }
            const newAvailableAppointments = [...availableAppointmentsWithoutNoChangedAppointment, updatedAppointment]
            const updatedService = await ServiceModel.findByIdAndUpdate(id, {
                $set: { availableAppointments: newAvailableAppointments }
            }, { new: true }).lean()

            if (!updatedService) return res.status(400).send({ error: "Servicio no acutalizado." })

            const formattedResponse = formatServiceResponse(updatedService as ServiceWithAppointments, updatedAppointment)

            return res.status(200).send({ data: formattedResponse })
        }

        const takenQuantity = service.scheduledAppointments.filter(date => date.getTime() === newDate.getTime()).length
        const newAvailableAppointment = {
            datetime: newDate,
            capacity: takenQuantity + 1,
            taken: takenQuantity
        }

        const updatedService = await ServiceModel.findByIdAndUpdate(id, {
            $push: { availableAppointments: newAvailableAppointment },
        }, { new: true }).lean()

        if (!updatedService) return res.status(400).send({ error: "Servicio no acutalizado." })

        const formattedResponse = formatServiceResponse(updatedService as ServiceWithAppointments, newAvailableAppointment)

        res.status(200).send({ data: formattedResponse })
    } catch (error: any) {
        res.status(500).send({ error: error.message })
    }
}

export const deleteEnabledAppointment = async (req: Request, res: Response): Promise<void | Response> => {
    try {
        const { id } = req.params
        const { date, all } = req.body

        const newDate = moment.tz(date, 'YYYY-MM-DD HH:mm', 'America/Argentina/Buenos_Aires').toDate()

        const service = await ServiceModel.findById(id).lean()

        if (!service) return res.status(404).send({ error: "Servicio no encontrado." })

        const appointmentToUpdate = service.availableAppointments.find(app => app.datetime.getTime() === newDate.getTime())

        if (!appointmentToUpdate) return res.status(404).send({ error: "Turno no encontrado" })

        const { action, updatedAppointments } = determineAppointmentAction(
            appointmentToUpdate,
            newDate,
            service.availableAppointments,
            all
        )

        let updatedService
        if (action === "remove-from-calendar") {
            updatedService = await ServiceModel.findByIdAndUpdate(id, {
                $pull: { availableAppointments: { datetime: newDate } }
            }, { new: true }).lean()
            appointmentToUpdate.capacity -= 1
        } else if (action === "remove-from-availables") {
            updatedService = await ServiceModel.findByIdAndUpdate(id, {
                $pull: { availableAppointments: { datetime: newDate } },
            }, { new: true }).lean()
            appointmentToUpdate.capacity -= 1
        } else if (action === "remove-all-availables") {
            updatedService = await ServiceModel.findByIdAndUpdate(id, {
                $pull: { availableAppointments: { datetime: newDate } },
            }, { new: true }).lean()
            appointmentToUpdate.capacity = 0
        } else {
            updatedService = await ServiceModel.findByIdAndUpdate(id,
                { $set: { availableAppointments: updatedAppointments } },
                { new: true }
            ).lean()
            appointmentToUpdate.capacity -= 1
        }

        if (!updatedService) return res.status(404).send({ error: "Servicio no actualizado." })

        const formattedResponse = formatServiceResponse(updatedService as ServiceWithAppointments, appointmentToUpdate)

        res.status(200).send({ data: formattedResponse })

    } catch (error: any) {
        res.status(500).send({ error: error.message })
    }
}

const determineAppointmentAction = (appointmentToUpdate: AvailableAppointment, newDate: Date, availableAppointments: AvailableAppointment[], all: boolean) => {
    const newCapacity = appointmentToUpdate.capacity - 1
    const appointmentsWithoutUpdated = availableAppointments.filter(app =>
        app.datetime.getTime() !== newDate.getTime()
    )

    if (all) {
        return { action: "remove-all-availables", updatedAppointments: appointmentsWithoutUpdated }
    }

    if (appointmentToUpdate.taken === 0 && (appointmentToUpdate.taken === newCapacity)) {
        return { action: "remove-from-calendar", updatedAppointments: appointmentsWithoutUpdated }
    }

    if (appointmentToUpdate.taken > 0 && (appointmentToUpdate.taken === newCapacity)) {
        return { action: "remove-from-availables", updatedAppointments: appointmentsWithoutUpdated }
    }

    const updatedAppointment = {
        ...appointmentToUpdate,
        capacity: appointmentToUpdate.capacity - 1
    }

    return {
        action: "udpate",
        updatedAppointments: [...appointmentsWithoutUpdated, updatedAppointment]
    }
}

const formatServiceResponse = (updatedService: ServiceWithAppointments, appointmentToSend: AvailableAppointment) => {
    const arrayAppointmentsInString = updatedService.availableAppointments.map(appointment => ({
        ...appointment,
        datetime: moment(appointment.datetime).tz('America/Argentina/Buenos_Aires').format('YYYY-MM-DD HH:mm')
    }))

    const scheduledAppointmentsInString = updatedService.scheduledAppointments.map(date =>
        moment(date).tz('America/Argentina/Buenos_Aires').format('YYYY-MM-DD HH:mm')
    )

    const pendingAppointmentsInString = updatedService.pendingAppointments.map(pending => ({
        ...pending,
        datetime: moment(pending.datetime).tz('America/Argentina/Buenos_Aires').format('YYYY-MM-DD HH:mm')
    }))

    return {
        service: {
            ...updatedService,
            availableAppointments: arrayAppointmentsInString,
            scheduledAppointments: scheduledAppointmentsInString,
            pendingAppointments: pendingAppointmentsInString
        },
        appointment: {
            ...appointmentToSend,
            datetime: moment(appointmentToSend.datetime).tz('America/Argentina/Buenos_Aires').format('YYYY-MM-DD HH:mm')
        }
    }
}