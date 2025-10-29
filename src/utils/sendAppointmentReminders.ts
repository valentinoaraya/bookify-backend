import cron from "node-cron"
import AppointmentModel from "../models/Appointment"
import CompanyModel from "../models/Company"
import moment from "moment-timezone"
import { sendEmail } from "../services/emailService"
import { formatDate } from "./formatDate"

const sendAppointmentReminders = async () => {
    try {
        console.log("🔍 Buscando turnos para enviar recordatorios...")

        const companies = await CompanyModel.find({ reminders: { $exists: true, $ne: [] } })
            .populate('reminders.services', 'title')

        if (companies.length === 0) {
            console.log("ℹ️ No hay empresas con recordatorios configurados")
            return
        }

        let totalRemindersSent = 0

        for (const company of companies) {
            console.log(`🏢 Procesando empresa: ${company.name}`)

            for (const reminderConfig of company.reminders) {
                const hoursBefore = reminderConfig.hoursBefore
                const targetServices = reminderConfig.services.map(service => service._id)

                const reminderTimeStart = moment().tz('America/Argentina/Buenos_Aires')
                    .add(hoursBefore, 'hours')
                    .startOf('hour')
                    .toDate()

                const reminderTimeEnd = moment().tz('America/Argentina/Buenos_Aires')
                    .add(hoursBefore, 'hours')
                    .endOf('hour')
                    .toDate()

                console.log(`⏰ Buscando turnos ${hoursBefore}h antes (${moment(reminderTimeStart).format('YYYY-MM-DD HH:mm')})`)

                const appointments = await AppointmentModel.find({
                    companyId: company._id,
                    serviceId: { $in: targetServices },
                    date: { $gte: reminderTimeStart, $lte: reminderTimeEnd }
                })
                    .populate<{ serviceId: { title: string } }>("serviceId", "title")
                    .populate<{ companyId: { name: string } }>("companyId", "name")

                console.log(`📅 Encontrados ${appointments.length} turnos para recordar`)

                for (const appointment of appointments) {
                    const appointmentDate = moment(appointment.date).tz('America/Argentina/Buenos_Aires')
                    const dateInString = appointmentDate.format('YYYY-MM-DD HH:mm')

                    let timeMessage = ""
                    if (hoursBefore === 24) {
                        timeMessage = "mañana"
                    } else if (hoursBefore === 2) {
                        timeMessage = "en 2 horas"
                    } else if (hoursBefore === 1) {
                        timeMessage = "en 1 hora"
                    } else {
                        timeMessage = `en ${hoursBefore} horas`
                    }

                    const subject = hoursBefore === 24
                        ? "🔔 Recordatorio de tu turno"
                        : `⏰ Tu turno es ${timeMessage}`

                    const textMessage = `Hola ${appointment.name},\n
                    \nTe recordamos que tienes un turno ${timeMessage} en ${appointment.companyId.name} para ${appointment.serviceId.title}.\n
                    \nFecha: ${formatDate(dateInString.split(' ')[0])} 
                    \nHora: ${dateInString.split(' ')[1]}\n
                    \n¡No olvides asistir!`

                    const htmlMessage = `<p>Hola ${appointment.name},</p>
                    <p>Te recordamos que tienes un turno ${timeMessage} en <strong>${appointment.companyId.name}</strong> para <strong>${appointment.serviceId.title}</strong>.</p>
                    <p>Fecha: ${formatDate(dateInString.split(' ')[0])}</p>
                    <p>Hora: ${dateInString.split(' ')[1]}</p>
                    <p>¡No olvides asistir!</p>`

                    try {
                        await sendEmail(
                            appointment.email,
                            subject,
                            textMessage,
                            htmlMessage
                        )

                        console.log(`✅ Recordatorio enviado a ${appointment.email} para turno ${timeMessage}`)
                        totalRemindersSent++
                    } catch (emailError) {
                        console.error(`❌ Error enviando email a ${appointment.email}:`, emailError)
                    }
                }
            }
        }

        console.log(`📧 Total de recordatorios enviados: ${totalRemindersSent}`)
    } catch (error: any) {
        console.error("❌ Error en sendAppointmentReminders:", error)
    }
}

export const startSendReminders = () => {
    cron.schedule("*/5 * * * *", async () => {
        console.log("⏳ Ejecutando tarea de recordatorio de turnos...");
        await sendAppointmentReminders()
    })
}
