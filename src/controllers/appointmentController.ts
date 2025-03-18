import { Request, Response } from "express";
import { emailCancelAppointmentCompany, emailCancelAppointmentUser, emailConfirmAppointmentUser, emailConfirmAppointmentCompany, emailDeleteAppointmentUser, emailDeleteAppointmentCompany } from "../utils/emailTextsAndHtmls";
import { appointmentToAdd } from "../utils/verifyData";
import ServiceModel from "../models/Service";
import AppointmentModel from "../models/Appointment";
import UserModel from "../models/User";
import CompanyModel from "../models/Company";
import { sendEmail } from "../services/emailService";
import moment from "moment-timezone";
import { generateRandomId } from "../utils/generateRandomId";

const createAppointment = async (companyId: string, serviceId: string, date: Date, userId: string, paymentId?: string) => {
    try {
        const service = await ServiceModel.findById(serviceId)
        const user = await UserModel.findById(userId)
        const company = await CompanyModel.findById(companyId)

        if (!user || !company || !service) throw new Error("Error al obtener empresa, servicio o usuario.")

        const appointment = appointmentToAdd({ companyId, serviceId, date, paymentId })
        const newAppointment = new AppointmentModel({ clientId: userId, ...appointment })
        const savedAppointment = await newAppointment.save()
        const dateInString = moment(date).tz('America/Argentina/Buenos_Aires').format('YYYY-MM-DD HH:mm')

        await ServiceModel.findByIdAndUpdate(appointment.serviceId, {
            $pull: { availableAppointments: appointment.date },
            $push: { scheduledAppointments: appointment.date }
        })
        await UserModel.findByIdAndUpdate(userId, {
            $push: { appointments: savedAppointment._id }
        })
        await CompanyModel.findByIdAndUpdate(appointment.companyId, {
            $push: { scheduledAppointments: savedAppointment._id }
        })

        const { htmlUser, textUser } = emailConfirmAppointmentUser(
            `${user.name} ${user.lastName}`,
            service.title,
            company.name,
            `${company.street} ${company.number}, ${company.city}`,
            dateInString.split(' ')[0],
            dateInString.split(' ')[1]
        )

        const { htmlCompany, textCompany } = emailConfirmAppointmentCompany(
            company.name,
            service.title,
            `${user.name} ${user.lastName}`,
            dateInString.split(' ')[0],
            dateInString.split(' ')[1]
        )

        await sendEmail(user.email, "Turno confirmado con éxito", textUser, htmlUser)
        await sendEmail(company.email, "Nuevo turno agendado", textCompany, htmlCompany)

        return {
            _id: savedAppointment._id,
            date: dateInString,
            serviceId: {
                title: service.title,
                duration: service.duration,
                price: service.price
            },
            companyId: {
                name: company.name,
                city: company.city,
                street: company.street,
                number: company.number
            },
        }
    } catch (error: any) {
        console.error(error)
        throw new Error(error)
    }
}

export const confirmAppointment = async (req: Request, res: Response): Promise<void | Response> => {
    try {

        if (!req.user) return res.status(500).send({ error: "Usuario no encontrado." })
        const idUser = req.user.id.toString()
        const { date, serviceId, companyId } = req.body

        const newDate = moment.tz(date, 'YYYY-MM-DD HH:mm', 'America/Argentina/Buenos_Aires')
        const appointment = await createAppointment(companyId, serviceId, newDate.toDate(), idUser)

        if (!appointment) return res.status(500).send({ error: "No se pudo crear el turno." })

        res.status(200).send({ data: appointment })

    } catch (error: any) {
        res.status(500).send({ error: error.message })
    }
}

export const confirmAppointmentWebhook = async (req: Request, res: Response): Promise<void | Response> => {
    try {

        const { type, action, data, user_id } = req.body

        if (type === "payment" && action === "payment.created") {

            const paymentId = data.id
            const company = await CompanyModel.findOne({ mp_user_id: user_id })

            if (!company) {
                return res.status(500).send({ error: "No se encontró la empresa." })
            }

            const response = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
                method: "GET",
                headers: {
                    'Authorization': `Bearer ${company.mp_access_token}`,
                    'Content-Type': 'application/json'
                }
            })

            const paymentInfo = await response.json()

            if (paymentInfo.status === "approved") {
                const paramsExternalReference = paymentInfo.external_reference.split("_")

                const userId = paramsExternalReference[0]
                const companyId = paramsExternalReference[1]
                const serviceId = paramsExternalReference[2]
                const date = paramsExternalReference[3]

                const newDate = moment.tz(date, 'YYYY-MM-DD HH:mm', 'America/Argentina/Buenos_Aires')

                await createAppointment(companyId, serviceId, newDate.toDate(), userId, paymentId)

                return res.status(200).send({ data: "Pago procesado y turno confirmado." })
            }

            return res.status(200).send({ error: "El pago no fué aprobado." })
        }

        res.status(200).send({ data: "Evento recibido pero no procesado." })

    } catch (error: any) {
        res.status(500).send({ error: error.message })
    }
}

const refund = async (paymentId: string, accessToken: string, amount?: number) => {
    try {

        const randomId = generateRandomId()

        const response = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}/refunds`, {
            method: "POST",
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'X-Idempotency-Key': randomId,
                'Content-Type': 'application/json'
            },
            body: amount ? JSON.stringify({ amount }) : null
        })

        const data = await response.json()

        if (!response.ok) {
            console.error("Error al procesar el reembolso: ", data)
            return null
        }

        console.log("Devolución completa.")

        return data

    } catch (error: any) {
        console.error('Error en refund: ', error)
        return null
    }
}

export const cancelAppointment = async (req: Request, res: Response): Promise<void | Response> => {
    try {
        if (!req.user) return res.status(500).send({ error: "Usuario no encontrado." })

        const { id } = req.params
        const appointment = await AppointmentModel.findById(id).lean()

        if (!appointment) return res.status(400).send({ error: "No se encontró el turno." })

        const now = moment()
        const appointmentDate = moment(appointment.date)

        const diffHours = appointmentDate.diff(now, 'hours')

        if (diffHours < 24) return res.status(400).send({ error: "No es posible cancelar el turno con menos de un día de anticipación." })

        const serviceAppointment = await ServiceModel.findById(appointment.serviceId)

        if (!serviceAppointment) return res.status(400).send({ error: "Servicio no encontrado." })

        if (serviceAppointment.signPrice > 0) {
            const company = await CompanyModel.findById(appointment.companyId)
            if (!company) return res.status(400).send({ error: "Empresa no encontrada." })

            const amount = serviceAppointment.signPrice * 0.5

            const refundResponse = await refund(appointment.paymentId as string, company.mp_access_token, amount)

            if (!refundResponse) return res.status(400).send({ error: "No se pudo procesar la devolución." })
        }

        await AppointmentModel.findByIdAndDelete(id)

        const dateInString = moment(appointment.date).tz('America/Argentina/Buenos_Aires').format('YYYY-MM-DD HH:mm')

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

        if (!service || !company) return res.status(500).send({ error: "Error al obtener empresa, servicio o usuario." })

        const { htmlUser, textUser } = emailCancelAppointmentUser(
            company.name,
            req.user.name,
            service.title,
            dateInString.split(' ')[0],
            dateInString.split(' ')[1],
        )

        const { htmlCompany, textCompany } = emailCancelAppointmentCompany(
            company.name,
            req.user.name,
            service.title,
            dateInString.split(' ')[0],
            dateInString.split(' ')[1],
        )

        await sendEmail(req.user.email, "Turno cancelado", textUser, htmlUser)
        await sendEmail(company.email, "Un turno ha sido cancelado", textCompany, htmlCompany)

        res.status(200).send({ data: { ...appointment, date: dateInString } })

    } catch (error: any) {
        res.status(500).send({ error: error.message })
    }
}

export const deleteAppointment = async (req: Request, res: Response): Promise<void | Response> => {
    try {
        if (!req.company) return res.status(500).send({ error: "Empresa no encontrada." })

        const { id } = req.params
        const appointment = await AppointmentModel.findByIdAndDelete(id).lean()

        if (!appointment) return res.status(400).send({ error: "No se encontró el turno." })

        const serviceAppointment = await ServiceModel.findById(appointment.serviceId)

        if (!serviceAppointment) return res.status(400).send({ error: "Servicio no encontrado." })

        if (serviceAppointment.signPrice > 0) {
            const company = await CompanyModel.findById(appointment.companyId)
            if (!company) return res.status(400).send({ error: "Empresa no encontrada." })
            const refundResponse = await refund(appointment.paymentId as string, company.mp_access_token)
            if (!refundResponse) return res.status(400).send({ error: "No se pudo procesar la devolución." })
        }

        const dateInString = moment(appointment.date).tz('America/Argentina/Buenos_Aires').format('YYYY-MM-DD HH:mm')

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

        if (!service || !user) return res.status(500).send({ error: "Error al obtener empresa, servicio o usuario." })

        const { htmlUser, textUser } = emailDeleteAppointmentUser(
            req.company.name,
            `${user.name} ${user.lastName}`,
            service.title,
            dateInString.split(' ')[0],
            dateInString.split(' ')[1]
        )

        const { htmlCompany, textCompany } = emailDeleteAppointmentCompany(
            req.company.name,
            `${user.name} ${user.lastName}`,
            service.title,
            dateInString.split(' ')[0],
            dateInString.split(' ')[1]
        )

        await sendEmail(user.email, "Tu turno ha sido cancelado", textUser, htmlUser)
        await sendEmail(req.company.email, "Turno cancelado", textCompany, htmlCompany)

        res.status(200).send({ data: { ...appointment, date: dateInString } })

    } catch (error: any) {
        res.status(500).send({ error: error.message })
    }
}

