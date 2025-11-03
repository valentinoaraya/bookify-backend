import { Request, Response } from "express";
import { emailCancelAppointmentCompany, emailCancelAppointmentUser, emailConfirmAppointmentUser, emailConfirmAppointmentCompany, emailDeleteAppointmentUser, emailDeleteAppointmentCompany, emailRefundAppointmentUser } from "../utils/emailTextsAndHtmls";
import { appointmentToAdd } from "../utils/verifyData";
import ServiceModel from "../models/Service";
import AppointmentModel from "../models/Appointment";
import CompanyModel from "../models/Company";
import { sendEmail } from "../services/emailService";
import moment from "moment-timezone";
import { generateRandomId } from "../utils/generateRandomId";
import { ServiceWithAppointments, UserData, UserInputAppointment } from "../types";
import { formatDate } from "../utils/formatDate";
import { isAppointmentAvailable, removePendingAppointment } from "../utils/managePendingAppointments";
import { io } from "../index"
import { scheduleRemindersForAppointment } from "../utils/scheduleRemindersForAppointment";
import { reminderQueue } from "../queues/reminderQueue";
import mongoose from "mongoose";

const createAppointment = async (companyId: string, serviceId: string, date: Date, dataUser: UserData, paymentId?: string, totalPaidAmount?: number) => {
    try {
        const service = await ServiceModel.findById(serviceId).lean()
        const company = await CompanyModel.findById(companyId)

        if (!company || !service) throw new Error("Error al obtener empresa, servicio o usuario.")

        const appointment = appointmentToAdd({ companyId, serviceId, date, paymentId, totalPaidAmount })
        const price = service.price
        const mode = service.mode
        const duration = service.duration
        const newAppointment = new AppointmentModel({ ...appointment, ...dataUser, price, mode, duration })
        const savedAppointment = await newAppointment.save()
        const appointmentToSend = await AppointmentModel.findById(savedAppointment._id).populate("serviceId").lean()
        const dateInString = moment(date).tz('America/Argentina/Buenos_Aires').format('YYYY-MM-DD HH:mm')

        const appt = service.availableAppointments.find(a => a.datetime.getTime() === date.getTime())
        if (!appt) throw new Error("Turno no encontrado.")

        appt.taken = (appt.taken || 0) + 1

        let serviceToSend
        if (appt.taken >= appt.capacity) {
            serviceToSend = await ServiceModel.findByIdAndUpdate(appointment.serviceId, {
                $pull: { availableAppointments: { datetime: appointment.date } },
                $push: { scheduledAppointments: appointment.date }
            }, { new: true }).lean()
        } else {
            serviceToSend = await ServiceModel.findOneAndUpdate(
                {
                    _id: appointment.serviceId,
                    "availableAppointments.datetime": appointment.date
                },
                {
                    $push: { scheduledAppointments: appointment.date },
                    $inc: { "availableAppointments.$.taken": 1 }
                },
                { new: true }
            ).lean();
        }

        await CompanyModel.findByIdAndUpdate(appointment.companyId, {
            $push: { scheduledAppointments: savedAppointment._id }
        })

        const { htmlUser, textUser } = emailConfirmAppointmentUser(
            `${dataUser.name} ${dataUser.lastName}`,
            service.title,
            company.name,
            `${company.street} ${company.number}, ${company.city}`,
            formatDate(dateInString.split(' ')[0]),
            dateInString.split(' ')[1],
            newAppointment.id,
            service.mode
        )

        const { htmlCompany, textCompany } = emailConfirmAppointmentCompany(
            company.name,
            service.title,
            `${dataUser.name} ${dataUser.lastName}`,
            formatDate(dateInString.split(' ')[0]),
            dateInString.split(' ')[1]
        )

        await sendEmail(dataUser.email, "✅ Turno confirmado con éxito", textUser, htmlUser)
        await sendEmail(company.email, "📅 Nuevo turno agendado", textCompany, htmlCompany)

        await scheduleRemindersForAppointment(savedAppointment._id.toString())

        return {
            ...appointmentToSend,
            serviceId: {
                ...serviceToSend,
                availableAppointments: serviceToSend?.availableAppointments.map(available => {
                    return {
                        ...available,
                        datetime: moment(available.datetime).tz('America/Argentina/Buenos_Aires').format('YYYY-MM-DD HH:mm')
                    }
                }),
                scheduledAppointments: serviceToSend?.scheduledAppointments.map(date => moment(date).tz('America/Argentina/Buenos_Aires').format('YYYY-MM-DD HH:mm')),
                pendingAppointments: serviceToSend?.pendingAppointments.map(pending => ({
                    ...pending,
                    datetime: moment(pending.datetime).tz('America/Argentina/Buenos_Aires').format('YYYY-MM-DD HH:mm')
                })),
            },
            date: moment(savedAppointment.date).tz('America/Argentina/Buenos_Aires').format('YYYY-MM-DD HH:mm'),
        }
    } catch (error: any) {
        console.error(error)
        throw new Error(error)
    }
}

export const confirmAppointment = async (req: Request, res: Response): Promise<void | Response> => {
    try {
        const { date, serviceId, companyId } = req.body.dataAppointment
        const userData = req.user

        const newDate = moment.tz(date, 'YYYY-MM-DD HH:mm', 'America/Argentina/Buenos_Aires')
        const appointment = await createAppointment(companyId, serviceId, newDate.toDate(), userData as UserData)

        if (!appointment) return res.status(500).send({ error: "No se pudo crear el turno." })

        io.to(appointment.companyId!.toString()).emit("company:appointment-added", appointment)

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
                const totalPaidAmount = paymentInfo.transaction_details.total_paid_amount

                const companyId = paramsExternalReference[0]
                const serviceId = paramsExternalReference[1]
                const date = paramsExternalReference[2]

                const dataUser = {
                    name: paramsExternalReference[3],
                    lastName: paramsExternalReference[4],
                    email: paramsExternalReference[5],
                    dni: paramsExternalReference[6],
                    phone: paramsExternalReference[7],
                }

                const pendingId = paramsExternalReference[8]

                const newDate = moment.tz(date, 'YYYY-MM-DD HH:mm', 'America/Argentina/Buenos_Aires')

                const userId = `${dataUser.name}_${dataUser.lastName}_${dataUser.email}`
                const isAvailable = await isAppointmentAvailable(serviceId, newDate.toDate(), userId)

                if (!isAvailable) {
                    console.log(`⚠️  Turno no disponible para ${dataUser.email}. Procesando reembolso...`)

                    const refundResponse = await refund(paymentId, company.mp_access_token, totalPaidAmount)

                    if (refundResponse) {
                        console.log(`✅ Reembolso procesado para ${dataUser.email}`)

                        const service = await ServiceModel.findById(serviceId).lean()

                        const { htmlUser, textUser } = emailRefundAppointmentUser(
                            company.name,
                            dataUser.name,
                            service?.title as string,
                            formatDate(newDate.format('YYYY-MM-DD')),
                            newDate.format('HH:mm')
                        )

                        await sendEmail(dataUser.email, "❌ Turno no disponible - Reembolso procesado", textUser, htmlUser)

                        return res.status(200).send({
                            data: "Pago aprobado pero turno no disponible. Reembolso procesado."
                        })
                    } else {
                        console.error(`❌ Error al procesar reembolso para ${dataUser.email}`)
                        return res.status(500).send({
                            error: "Error al procesar reembolso. Contactar al soporte."
                        })
                    }
                }

                const appointment = await createAppointment(companyId, serviceId, newDate.toDate(), dataUser, paymentId, totalPaidAmount)

                if (!appointment) {
                    return res.status(500).send({ error: "No se pudo crear el turno." })
                }

                io.to(appointment.companyId!.toString()).emit("company:appointment-added", appointment)

                const pendingRemoved = await removePendingAppointment(
                    serviceId,
                    pendingId
                )

                if (pendingRemoved) {
                    console.log(`✅ Turno confirmado para ${dataUser.email} y removido de pendingAppointments`)
                } else {
                    console.log(`⚠️ Turno confirmado para ${dataUser.email} pero no se pudo remover de pendingAppointments`)
                }

                return res.status(200).send({ data: "Pago procesado y turno confirmado." })
            }

            return res.status(200).send({ error: "El pago no fué aprobado." })
        }

        res.status(200).send({ data: "Evento recibido pero no procesado." })

    } catch (error: any) {
        res.status(500).send({ error: error.message })
    }
}

export const checkOrderTime = async (req: Request, res: Response): Promise<void | Response> => {
    try {
        const { companyId, date } = req.body

        const company = await CompanyModel.findById(companyId)
        if (!company) return res.status(500).send({ error: "No se encontró la empresa." })

        const bookingHour = moment(date).subtract(company.bookingAnticipationHours, "hours")
        const now = moment()

        let messageHours = ""
        if (company.bookingAnticipationHours > 24) {
            messageHours = `${company.bookingAnticipationHours / 24} ${company.bookingAnticipationHours / 24 === 1 ? "día" : "días"}`
        } else {
            messageHours = `${company.bookingAnticipationHours} ${company.bookingAnticipationHours === 1 ? "hora" : "horas"}`
        }

        if (now.isSameOrAfter(bookingHour)) return res.status(400).send({
            error: `No es posible agendar el turno en este momento. Las agendas se realizan ${messageHours} antes del horario del turno.`
        })

        res.status(200).send({ data: "available" })

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

const removeFromScheduledAndEnable = async (service: ServiceWithAppointments, appointment: UserInputAppointment) => {
    try {
        const datesEqualToTheAppointment = service.scheduledAppointments.filter(d => d.getTime() === appointment.date.getTime())
        if (datesEqualToTheAppointment.length === 0) throw new Error("Turno no encontrado en 'agendados'")
        datesEqualToTheAppointment.pop()
        const scheduledAppointments = service.scheduledAppointments.filter(d => d.getTime() !== appointment.date.getTime())
        const newScheduledAppointments = [...scheduledAppointments, ...datesEqualToTheAppointment]

        let serviceToSend

        serviceToSend = await ServiceModel.findByIdAndUpdate(
            appointment.serviceId,
            {
                $set: { scheduledAppointments: newScheduledAppointments }
            },
            { new: true }
        ).lean()

        if (service.availableAppointments.some(item => item.datetime.getTime() === appointment.date.getTime())) {
            const appointmentToChange = service.availableAppointments.find(app => app.datetime.getTime() === appointment.date.getTime())
            if (!appointmentToChange) throw new Error("No se encontró el turno")
            const changedAppointment = { ...appointmentToChange, taken: appointmentToChange.taken - 1 }
            const availableAppointmentsWithoutNoChangedAppointment = service.availableAppointments.filter(app => app.datetime.getTime() !== appointment.date.getTime())
            const newAvailablesAppointments = [...availableAppointmentsWithoutNoChangedAppointment, changedAppointment]

            serviceToSend = await ServiceModel.findByIdAndUpdate(
                appointment.serviceId,
                {
                    $set: { availableAppointments: newAvailablesAppointments }
                },
                { new: true }
            ).lean()
        } else {
            const newAvailableAppointment = {
                datetime: appointment.date,
                capacity: datesEqualToTheAppointment.length + 1,
                taken: datesEqualToTheAppointment.length
            }

            const newAvailableAppointments = [...service.availableAppointments, newAvailableAppointment]

            serviceToSend = await ServiceModel.findByIdAndUpdate(
                appointment.serviceId,
                {
                    $set: { availableAppointments: newAvailableAppointments }
                },
                { new: true }
            ).lean()
        }

        return serviceToSend

    } catch (error: any) {
        throw new Error(error)
    }
}

const removeRemindersJobs = async (remindersJobs: string[]) => {
    for (const jobId of remindersJobs) {
        const job = await reminderQueue.getJob(jobId)
        if (job) {
            await job.remove()
            console.log(`🗑 Job ${jobId} eliminado`)
        }
    }
}

export const cancelAppointment = async (req: Request, res: Response): Promise<void | Response> => {
    try {
        if (!req.user) return res.status(500).send({ error: "Usuario no encontrado." })

        const { id } = req.params
        const appointment = await AppointmentModel.findById(id).lean()
        if (!appointment) return res.status(400).send({ error: "No se encontró el turno." })

        const company = await CompanyModel.findById(appointment.companyId)
        if (!company) return res.status(400).send({ error: "Empresa no encontrada." })

        const now = moment()
        const appointmentDate = moment(appointment.date)

        const diffHours = appointmentDate.diff(now, 'hours')

        let messageHours = ""
        if (company.cancellationAnticipationHours > 24) {
            messageHours = `${company.cancellationAnticipationHours / 24} ${company.cancellationAnticipationHours / 24 === 1 ? "día" : "días"}`
        } else {
            messageHours = `${company.cancellationAnticipationHours} ${company.cancellationAnticipationHours === 1 ? "hora" : "horas"}`
        }

        if (diffHours < company.cancellationAnticipationHours) return res.status(400).send({
            error: `No es posible cancelar el turno con menos de ${messageHours} de anticipación.`
        })

        const service = await ServiceModel.findById(appointment.serviceId).lean()

        if (!service) return res.status(400).send({ error: "Servicio no encontrado." })

        if (appointment.paymentId && appointment.totalPaidAmount) {
            const amount = appointment.totalPaidAmount * 0.5

            const refundResponse = await refund(appointment.paymentId as string, company.mp_access_token, amount)

            if (!refundResponse) return res.status(400).send({ error: "No se pudo procesar la devolución." })
        }

        await AppointmentModel.findByIdAndUpdate(id, {
            $set: { status: "cancelled", cancelledBy: "client", reminderJobs: [] }
        })

        const serviceToSend = await removeFromScheduledAndEnable(service as ServiceWithAppointments, appointment as unknown as UserInputAppointment)

        await removeRemindersJobs(appointment.reminderJobs || [])

        await CompanyModel.findByIdAndUpdate(appointment.companyId, {
            $pull: { scheduledAppointments: appointment._id }
        })

        const dateInString = moment(appointment.date).tz('America/Argentina/Buenos_Aires').format('YYYY-MM-DD HH:mm')

        io.to(company._id.toString()).emit("company:appointment-deleted", {
            appointment: {
                ...appointment,
                date: dateInString
            },
            service: {
                ...serviceToSend,
                availableAppointments: serviceToSend?.availableAppointments.map(app => ({
                    ...app,
                    datetime: moment(app.datetime).tz('America/Argentina/Buenos_Aires').format('YYYY-MM-DD HH:mm')
                })),
                pendingAppointments: serviceToSend?.pendingAppointments.map(pending => ({
                    ...pending,
                    datetime: moment(pending.datetime).tz('America/Argentina/Buenos_Aires').format('YYYY-MM-DD HH:mm')
                })),
                scheduledAppointments: serviceToSend?.scheduledAppointments.map(date => moment(date).tz('America/Argentina/Buenos_Aires').format('YYYY-MM-DD HH:mm'))
            }
        })

        const { htmlUser, textUser } = emailCancelAppointmentUser(
            company.name,
            req.user.name,
            service.title,
            formatDate(dateInString.split(' ')[0]),
            dateInString.split(' ')[1],
        )

        const { htmlCompany, textCompany } = emailCancelAppointmentCompany(
            company.name,
            req.user.name,
            service.title,
            formatDate(dateInString.split(' ')[0]),
            dateInString.split(' ')[1],
        )

        await sendEmail(req.user.email, "❌ Turno cancelado", textUser, htmlUser)
        await sendEmail(company.email, "❌ Un turno ha sido cancelado", textCompany, htmlCompany)

        res.status(200).send({ data: { serviceToSend } })

    } catch (error: any) {
        res.status(500).send({ error: error.message })
    }
}

export const deleteAppointment = async (req: Request, res: Response): Promise<void | Response> => {
    try {
        if (!req.company) return res.status(500).send({ error: "Empresa no encontrada." })

        const { id } = req.params

        const { serviceToSend, appointment, dateInString } = await deleteAppointmentProcess(id, req.company.name, req.company.email)

        const availableAppointmentsToSend = serviceToSend?.availableAppointments.map(appointment => {
            return {
                ...appointment,
                datetime: moment(appointment.datetime).tz('America/Argentina/Buenos_Aires').format('YYYY-MM-DD HH:mm')
            }
        })

        const scheduledAppointmentsToSend = serviceToSend?.scheduledAppointments.map(date => moment(date).tz('America/Argentina/Buenos_Aires').format('YYYY-MM-DD HH:mm'))

        res.status(200).send({
            data: {
                appointment: { ...appointment, date: dateInString },
                service: {
                    ...serviceToSend,
                    availableAppointments: availableAppointmentsToSend,
                    scheduledAppointments: scheduledAppointmentsToSend
                }
            }
        })

    } catch (error: any) {
        res.status(500).send({ error: error.message })
    }
}

export const deleteAppointmentProcess = async (idAppointment: string, companyName: string, companyEmail: string) => {
    try {
        const appointment = await AppointmentModel.findById(idAppointment).lean()

        if (!appointment) throw new Error("Turno no encontrado.")

        const service = await ServiceModel.findById(appointment.serviceId).lean()

        if (!service) throw new Error("Servicio no encontrado.")

        if (appointment.paymentId) {
            const company = await CompanyModel.findById(appointment.companyId)
            if (!company) throw new Error("Empresa no encontrada.")
            const refundResponse = await refund(appointment.paymentId as string, company.mp_access_token)
            if (!refundResponse) throw new Error("No se pudo procesar la devolución.")
        }

        await AppointmentModel.findByIdAndUpdate(idAppointment, {
            $set: { status: "cancelled", cancelledBy: "company", reminderJobs: [] }
        })

        await removeRemindersJobs(appointment.reminderJobs || [])

        const serviceToSend = await removeFromScheduledAndEnable(service as ServiceWithAppointments, appointment as unknown as UserInputAppointment)

        await CompanyModel.findByIdAndUpdate(appointment.companyId, {
            $pull: { scheduledAppointments: appointment._id }
        })

        const dateInString = moment(appointment.date).tz('America/Argentina/Buenos_Aires').format('YYYY-MM-DD HH:mm')

        const { htmlUser, textUser } = emailDeleteAppointmentUser(
            companyName,
            `${appointment.name} ${appointment.lastName}`,
            service.title,
            formatDate(dateInString.split(' ')[0]),
            dateInString.split(' ')[1]
        )

        const { htmlCompany, textCompany } = emailDeleteAppointmentCompany(
            companyName,
            `${appointment.name} ${appointment.lastName}`,
            service.title,
            formatDate(dateInString.split(' ')[0]),
            dateInString.split(' ')[1]
        )

        await sendEmail(appointment.email as string, "❌ Tu turno ha sido cancelado", textUser, htmlUser)
        await sendEmail(companyEmail, "❌ Turno cancelado", textCompany, htmlCompany)

        return { serviceToSend, appointment, dateInString }

    } catch (error: any) {
        console.error("Error in deleteAppointmentProcess: ", error)
        throw new Error(error.message)
    }
}

export const getAppointment = async (req: Request, res: Response): Promise<void | Response> => {
    try {
        const { id } = req.params
        const appointment = await AppointmentModel.findById(id).lean()

        if (!appointment) return res.status(400).send({ error: "No se encontró el turno." })

        const service = await ServiceModel.findById(appointment.serviceId)
        const company = await CompanyModel.findById(appointment.companyId)

        if (!service || !company) return res.status(500).send({ error: "Error al obtener empresa, servicio o usuario." })

        const dateInString = moment(appointment.date).tz('America/Argentina/Buenos_Aires').format('YYYY-MM-DD HH:mm')

        return res.status(200).send({
            data: {
                ...appointment,
                date: dateInString,
                service: {
                    title: service.title,
                    duration: service.duration,
                    price: service.price,
                    signPrice: service.signPrice,
                },
                company: {
                    name: company.name,
                    city: company.city,
                    street: company.street,
                    number: company.number,
                    phone: company.phone,
                    email: company.email,
                }
            }
        })
    } catch (error: any) {
        res.status(500).send({ error: error.message })
    }
}

export const getCompanyHistory = async (req: Request, res: Response): Promise<void | Response> => {
    try {
        const { companyId } = req.params;
        const { page = 1, limit = 20, from, to } = req.query

        const filters: any = { companyId, status: { $ne: "scheduled" } }
        const skip = (+page - 1) * +limit

        let appointments
        let total
        let hasMore

        if (from && to) {
            const startDate = moment.tz(`${from}`, 'YYYY-MM-DD', 'America/Argentina/Buenos_Aires').toDate()
            const endDate = moment.tz(`${to}`, 'YYYY-MM-DD', 'America/Argentina/Buenos_Aires').toDate()
            appointments = await AppointmentModel.find({ ...filters, date: { $gte: startDate, $lte: endDate } })
                .sort({ date: -1 })
                .populate("serviceId")
                .populate("companyId")
                .lean()
            total = await AppointmentModel.countDocuments(filters)
            hasMore = false
        } else {
            appointments = await AppointmentModel.find(filters)
                .sort({ date: -1 })
                .skip(skip)
                .limit(+limit)
                .populate("serviceId")
                .populate("companyId")
                .lean()
            total = await AppointmentModel.countDocuments(filters)
            hasMore = +total > +skip + appointments.length
        }

        const pendingAppointments = await AppointmentModel.find({
            companyId,
            status: "pending_action"
        })
            .sort({ date: -1 })
            .populate("serviceId")
            .populate("companyId")
            .lean()

        const formattedAppointments = (appointments as any[]).map(appointment => {

            const appointmentDate = new Date(appointment.date);
            const formattedDate = moment(appointmentDate).tz('America/Argentina/Buenos_Aires').format('YYYY-MM-DD HH:mm');

            return {
                _id: appointment._id,
                name: appointment.name,
                lastName: appointment.lastName,
                email: appointment.email,
                serviceInfo: appointment.serviceInfo,
                phone: appointment.phone,
                dni: appointment.dni,
                mode: appointment.mode,
                duration: appointment.duration,
                serviceId: {
                    _id: appointment.serviceId?._id,
                    title: appointment.serviceId?.title,
                    duration: appointment.serviceId?.duration,
                    price: appointment.serviceId?.price
                },
                companyId: {
                    _id: appointment.companyId._id,
                    name: appointment.companyId.name
                },
                date: appointment.date,
                formattedDate: formattedDate,
                totalPaidAmount: appointment.totalPaidAmount,
                status: appointment.status,
                price: appointment.price || 0,
                cancelledBy: appointment.cancelledBy
            };
        }).filter(appointment => appointment !== null);

        const formattedPendingAppointments = (pendingAppointments as any[]).map(appointment => {
            if (!appointment.serviceId) {
                return null;
            }

            const appointmentDate = new Date(appointment.date);
            const formattedDate = moment(appointmentDate).tz('America/Argentina/Buenos_Aires').format('YYYY-MM-DD HH:mm');

            return {
                _id: appointment._id,
                name: appointment.name,
                lastName: appointment.lastName,
                email: appointment.email,
                phone: appointment.phone,
                dni: appointment.dni,
                mode: appointment.mode,
                serviceId: {
                    _id: appointment.serviceId._id,
                    title: appointment.serviceId.title,
                    duration: appointment.serviceId.duration,
                    price: appointment.serviceId.price
                },
                companyId: {
                    _id: appointment.companyId._id,
                    name: appointment.companyId.name
                },
                date: appointment.date,
                formattedDate: formattedDate,
                totalPaidAmount: appointment.totalPaidAmount,
                status: appointment.status,
                price: appointment.price || 0,
                cancelledBy: appointment.cancelledBy
            };
        }).filter(appointment => appointment !== null);

        const tz = 'America/Argentina/Buenos_Aires'
        const nowTz = moment.tz(moment(), tz)
        const startOfMonth = nowTz.clone().startOf('month').toDate()
        const endOfMonth = nowTz.clone().endOf('month').toDate()

        const [finishedThisMonth, totalAppointmentsThisMonth, popularServiceAgg] = await Promise.all([
            AppointmentModel.find({
                companyId,
                status: { $ne: "scheduled" },
                date: { $gte: startOfMonth, $lte: endOfMonth }
            }).populate('serviceId').lean(),
            AppointmentModel.countDocuments({
                companyId,
                date: { $gte: startOfMonth, $lte: endOfMonth }
            }),
            AppointmentModel.aggregate([
                { $match: { companyId: new mongoose.Types.ObjectId(companyId) } },
                { $group: { _id: '$serviceId', count: { $sum: 1 } } },
                { $sort: { count: -1 } },
                {
                    $lookup: { from: 'services', localField: '_id', foreignField: '_id', as: 'service' }
                },
                {
                    $match: { 'service.0': { $exists: true } }
                },
                { $limit: 1 },
                { $unwind: '$service' },
                { $project: { _id: 0, serviceId: '$_id', title: '$service.title', count: 1 } }
            ])
        ])

        const totalIncome = (finishedThisMonth as any[]).reduce((acc, appt: any) => {
            let price = 0
            if (appt.status === "finished") {
                price = (appt?.price || 0) + (appt?.totalPaidAmount || 0)
            } else if (appt.status === "did_not_attend") {
                price = appt?.totalPaidAmount || 0
            } else if (appt.status === "cancelled" && appt.cancelledBy === "company") {
                price = 0
            } else if (appt.status === "cancelled" && appt.cancelledBy === "client") {
                price = appt?.totalPaidAmount ? appt.totalPaidAmount * 0.5 : 0
            }
            return acc + (typeof price === 'number' ? price : 0)
        }, 0)

        const finishedAppointmentsCount = (finishedThisMonth as any[]).filter((appt: any) => appt.status === "finished").length
        const finishedAppointmentsPercentage = totalAppointmentsThisMonth > 0
            ? (finishedAppointmentsCount / totalAppointmentsThisMonth) * 100
            : 0

        const mostPopularService = popularServiceAgg && popularServiceAgg.length > 0
            ? popularServiceAgg[0].title
            : "N/A"

        res.status(200).send({
            data: formattedAppointments,
            pendingAppointments: formattedPendingAppointments,
            hasMore,
            total,
            totalPages: Math.ceil(total / +limit),
            currentPage: +page,
            stats: {
                totalIncome,
                totalAppointments: totalAppointmentsThisMonth,
                mostPopularService,
                finishedAppointmentsPercentage
            }
        })

    } catch (error: any) {
        res.status(500).send({ error: error.message });
    }
}

export const finishAppointment = async (req: Request, res: Response): Promise<void | Response> => {
    try {
        const { id } = req.params

        const appointment = await AppointmentModel.findByIdAndUpdate(id, {
            $set: {
                status: "finished",
                reminderJobs: []
            }
        }, { new: true }).lean()

        if (!appointment) return res.status(400).send({ error: "No se pudo finalizar el turno." })

        const company = await CompanyModel.findByIdAndUpdate(appointment.companyId, {
            $pull: { scheduledAppointments: new mongoose.Types.ObjectId(id) }
        })

        if (!company) return res.status(400).send({ error: "No se pudo eliminar el turno de 'agendados'." })

        res.status(200).send({ data: appointment })
    } catch (error: any) {
        res.status(500).send({ error: error.message });
    }
}

export const changeAppointmentStatus = async (req: Request, res: Response): Promise<void | Response> => {
    try {
        const { appointmentId, status } = req.body

        if (status !== "finished" && status !== "did_not_attend") {
            return res.status(400).send({ error: "Estado no aceptado." });
        }

        const appointmentUpdated = await AppointmentModel.findByIdAndUpdate(appointmentId, {
            $set: { status }
        }, { new: true }).lean()

        if (!appointmentUpdated) return res.status(400).send({ error: "No se pudo actualizar el turno." })

        res.status(200).send({ data: appointmentUpdated })

    } catch (error: any) {
        res.status(500).send({ error: error.message });
    }
}