import { Request, Response } from "express";
import { appointmentToAdd } from "../utils";
import ServiceModel from "../models/Service";
import AppointmentModel from "../models/Appointment";
import UserModel from "../models/User";
import CompanyModel from "../models/Company";

export const createAppointment = async (req: Request, res: Response): Promise<void | Response> => {
    try {
        const idUser = req.user?.id
        const appointment = appointmentToAdd(req.body)

        const service = await ServiceModel.findByIdAndUpdate(appointment.serviceId, {
            $pull: { availableAppointments: appointment.date },
            $push: { scheduledAppointments: appointment.date }
        })

        const newAppointment = new AppointmentModel({ clientId: idUser, ...appointment })

        const savedAppointment = await newAppointment.save()
        await UserModel.findByIdAndUpdate(idUser, {
            $push: { appointments: savedAppointment._id }
        })
        const company = await CompanyModel.findByIdAndUpdate(appointment.companyId, {
            $push: { scheduledAppointments: savedAppointment._id }
        })

        res.send({
            data: {
                _id: savedAppointment._id,
                date: savedAppointment.date,
                serviceId: {
                    title: service?.title,
                    duration: service?.duration,
                    price: service?.price
                },
                companyId: {
                    name: company?.name,
                    city: company?.city,
                    street: company?.street,
                    number: company?.number
                },
            }
        }).status(200)
    } catch (error: any) {
        res.send({ error: error.message }).status(500)
    }
}

export const cancelAppointment = async (req: Request, res: Response): Promise<void | Response> => {
    try {
        const { id } = req.params
        const appointment = await AppointmentModel.findByIdAndDelete(id)

        if (!appointment) return res.send({ error: "No se encontró el turno." }).status(400)

        await ServiceModel.findByIdAndUpdate(appointment.serviceId, {
            $pull: { scheduledAppointments: appointment.date },
            $push: { availableAppointments: appointment.date }
        })
        await UserModel.findByIdAndUpdate(appointment.clientId, {
            $pull: { appointments: appointment._id }
        })
        await CompanyModel.findByIdAndUpdate(appointment.companyId, {
            $pull: { scheduledAppointments: appointment._id }
        })

        res.send({ data: appointment }).status(200)

    } catch (error: any) {
        res.send({ error: error.message }).status(500)
    }
}

