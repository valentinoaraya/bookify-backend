import { Request, Response } from "express";
import { emailCancelAppointmentCompany, emailCancelAppointmentUser, emailConfirmAppointmentUser, emailConfirmAppointmentCompany, emailDeleteAppointmentUser, emailDeleteAppointmentCompany } from "../utils/emailTextsAndHtmls";
import { appointmentToAdd } from "../utils/verifyData";
import ServiceModel from "../models/Service";
import AppointmentModel from "../models/Appointment";
import UserModel from "../models/User";
import CompanyModel from "../models/Company";
import { sendEmail } from "../services/emailService";

export const createAppointment = async (req: Request, res: Response): Promise<void | Response> => {
    try {

        const { type, action, data, user_id } = req.body

        console.log("Req body: ", req.body)

        if (type === "payment" && action === "payment.created") {

            const paymentId = data.id
            const company = await CompanyModel.findOne({ mp_user_id: user_id })

            if (!company) {
                console.error("No se encontró la empresa.")
                return res.send({ error: "No se encontró la empresa." })
            }

            const response = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
                method: "GET",
                headers: {
                    'Authorization': `Bearer ${company.mp_access_token}`,
                    'Content-Type': 'application/json'
                }
            })

            const paymentInfo = await response.json()

            console.log("Payment info: ", paymentInfo)

            if (paymentInfo.status === "approved") {
                const paramsExternalReference = paymentInfo.external_reference.split("_")

                const userId = paramsExternalReference[0]
                const companyId = paramsExternalReference[1]
                const serviceId = paramsExternalReference[2]
                const date = paramsExternalReference[3]

                const appointment = appointmentToAdd({ companyId, serviceId, date })

                const service = await ServiceModel.findByIdAndUpdate(appointment.serviceId, {
                    $pull: { availableAppointments: appointment.date },
                    $push: { scheduledAppointments: appointment.date }
                })

                const newAppointment = new AppointmentModel({ clientId: userId, ...appointment })

                const savedAppointment = await newAppointment.save()
                const user = await UserModel.findByIdAndUpdate(userId, {
                    $push: { appointments: savedAppointment._id }
                })
                await CompanyModel.findByIdAndUpdate(appointment.companyId, {
                    $push: { scheduledAppointments: savedAppointment._id }
                })

                if (!user || !service) return res.send({ error: "Error al obtener empresa o servicio." }).status(500)

                const { htmlUser, textUser } = emailConfirmAppointmentUser(
                    `${user.name} ${user.lastName}`,
                    service.title,
                    company.name,
                    `${company.street} ${company.number}, ${company.city}`,
                    newAppointment.date.split(" ")[0],
                    newAppointment.date.split(" ")[1]
                )

                const { htmlCompany, textCompany } = emailConfirmAppointmentCompany(
                    company.name,
                    service.title,
                    `${user.name} ${user.lastName}`,
                    newAppointment.date.split(" ")[0],
                    newAppointment.date.split(" ")[1]
                )

                await sendEmail(user.email, "Turno confirmado con éxito", textUser, htmlUser)
                await sendEmail(company.email, "Nuevo turno agendado", textCompany, htmlCompany)

                return res.send({ data: "Pago procesado y turno confirmado." }).status(200)

                // return res.send({
                //     data: {
                //         _id: savedAppointment._id,
                //         date: savedAppointment.date,
                //         serviceId: {
                //             title: service.title,
                //             duration: service.duration,
                //             price: service.price
                //         },
                //         companyId: {
                //             name: company.name,
                //             city: company.city,
                //             street: company.street,
                //             number: company.number
                //         },
                //     }
                // }).status(200)
            }


            return res.send({ error: "El pago no fué aprobado." }).status(200)
        }

        console.log("Evento recibido pero no procesado.")
        res.send({ data: "Evento recibido pero no procesado." }).status(200)

    } catch (error: any) {
        console.error(error.message)
        res.send({ error: error.message }).status(500)
    }
}

export const cancelAppointment = async (req: Request, res: Response): Promise<void | Response> => {
    try {
        if (!req.user) return res.send({ error: "Usuario no encontrado." }).status(500)

        const { id } = req.params
        const appointment = await AppointmentModel.findByIdAndDelete(id)

        if (!appointment) return res.send({ error: "No se encontró el turno." }).status(400)

        const service = await ServiceModel.findByIdAndUpdate(appointment.serviceId, {
            $pull: { scheduledAppointments: appointment.date },
            $push: { availableAppointments: appointment.date }
        })
        await UserModel.findByIdAndUpdate(appointment.clientId, {
            $pull: { appointments: appointment._id }
        })
        const company = await CompanyModel.findByIdAndUpdate(appointment.companyId, {
            $pull: { scheduledAppointments: appointment._id }
        })

        if (!service || !company) return res.send({ error: "Error al obtener empresa, servicio o usuario." }).status(500)

        const { htmlUser, textUser } = emailCancelAppointmentUser(
            company.name,
            req.user.name,
            service.title,
            appointment.date.split(" ")[0],
            appointment.date.split(" ")[1],
        )

        const { htmlCompany, textCompany } = emailCancelAppointmentCompany(
            company.name,
            req.user.name,
            service.title,
            appointment.date.split(" ")[0],
            appointment.date.split(" ")[1],
        )

        await sendEmail(req.user.email, "Turno cancelado", textUser, htmlUser)
        await sendEmail(company.email, "Un turno ha sido cancelado", textCompany, htmlCompany)

        res.send({ data: appointment }).status(200)

    } catch (error: any) {
        res.send({ error: error.message }).status(500)
    }
}

export const deleteAppointment = async (req: Request, res: Response): Promise<void | Response> => {
    try {
        if (!req.company) return res.send({ error: "Usuario no encontrado." }).status(500)

        const { id } = req.params
        const appointment = await AppointmentModel.findByIdAndDelete(id)

        if (!appointment) return res.send({ error: "No se encontró el turno." }).status(400)

        const service = await ServiceModel.findByIdAndUpdate(appointment.serviceId, {
            $pull: { scheduledAppointments: appointment.date },
            $push: { availableAppointments: appointment.date }
        })
        const user = await UserModel.findByIdAndUpdate(appointment.clientId, {
            $pull: { appointments: appointment._id }
        })
        await CompanyModel.findByIdAndUpdate(appointment.companyId, {
            $pull: { scheduledAppointments: appointment._id }
        })

        if (!service || !user) return res.send({ error: "Error al obtener empresa, servicio o usuario." }).status(500)

        const { htmlUser, textUser } = emailDeleteAppointmentUser(
            req.company.name,
            `${user.name} ${user.lastName}`,
            service.title,
            appointment.date.split(" ")[0],
            appointment.date.split(" ")[1],
        )

        const { htmlCompany, textCompany } = emailDeleteAppointmentCompany(
            req.company.name,
            `${user.name} ${user.lastName}`,
            service.title,
            appointment.date.split(" ")[0],
            appointment.date.split(" ")[1],
        )

        await sendEmail(user.email, "Tu turno ha sido cancelado", textUser, htmlUser)
        await sendEmail(req.company.email, "Turno cancelado", textCompany, htmlCompany)

        res.send({ data: appointment }).status(200)

    } catch (error: any) {
        res.send({ error: error.message }).status(500)
    }
}

