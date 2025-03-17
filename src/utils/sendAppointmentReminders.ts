import cron from "node-cron"
import AppointmentModel from "../models/Appointment"
import moment from "moment-timezone"
import { sendEmail } from "../services/emailService"

const sendAppointmentReminders = async () => {
    try {
        const tomorrowStart = moment().tz('America/Argentina/Buenos_Aires').add(1, 'day').startOf('day').toDate()
        const tomorrowEnd = moment().tz('America/Argentina/Buenos_Aires').add(1, 'day').endOf('day').toDate()

        const appointments = await AppointmentModel.find(
            { date: { $gte: tomorrowStart, $lte: tomorrowEnd } }
        )
            .populate<{ clientId: { email: string, name: string } }>("clientId", "email name")
            .populate<{ serviceId: { title: string } }>("serviceId", "title")
            .populate<{ companyId: { name: string } }>("companyId", "name")


        if (appointments.length === 0) return

        for (const appointment of appointments) {

            const dateInString = moment(appointment.date).tz('America/Argentina/Buenos_Aires').format('YYYY-MM-DD HH:mm')

            await sendEmail(
                appointment.clientId.email,
                "🔔 Recordatorio de tu turno",

                `Hola ${appointment.clientId.name},\n
                \nTe recordamos que tienes un turno mañana en ${appointment.companyId.name} para ${appointment.serviceId.title}.\n
                \nFecha: ${dateInString.split(' ')[0]} 
                \nHora: ${dateInString.split(' ')[1]}\n
                \n¡No olvides asistir!`,

                `<p>Hola ${appointment.clientId.name},</p>
                <p>Te recordamos que tienes un turno mañana en <strong>${appointment.companyId.name}</strong> para <strong>${appointment.serviceId.title}</strong>.</p>
                <p>Fecha: ${dateInString.split(' ')[0]}</p>
                <p>Hora: ${dateInString.split(' ')[1]}</p>`
            )
        }
    } catch (error: any) {
        console.error(error)
    }
}

export const startSendReminders = () => {
    cron.schedule("0 8 * * *", async () => {
        console.log("⏳ Ejecutando tarea de recordatorio de turnos...");
        await sendAppointmentReminders()
    })
}