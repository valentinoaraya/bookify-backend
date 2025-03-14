import nodemailer from "nodemailer"
import { NODEMAILER_HOST, NODEMAILER_PASSWORD, NODEMAILER_PORT, NODEMAILER_USER } from "../config";
import { Email } from "../types";
import cron from "node-cron"
import AppointmentModel from "../models/Appointment";
import moment from "moment-timezone"

const transporter = nodemailer.createTransport({
    host: NODEMAILER_HOST,
    port: Number(NODEMAILER_PORT),
    secure: false,
    auth: {
        user: NODEMAILER_USER,
        pass: NODEMAILER_PASSWORD,
    }
});

export const sendEmail = async (to: Email | string, subject: string, text: string, html: string) => {
    try {
        await transporter.sendMail({
            from: '"Bookify" <valentinoaraya04@gmail.com>',
            to,
            subject,
            text,
            html
        });
        console.log(`📧 Correo enviado a ${to}`);
    } catch (error) {
        console.error("❌ Error enviando el correo:", error);
    }
};

const sendAppointmentReminders = async () => {
    try {
        const tomorrow = moment().add(1, "day").format("YYYY-MM-DD")

        const appointments = await AppointmentModel.find({ date: { $regex: `^${tomorrow}` } })
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

export const startCronJobs = () => {
    cron.schedule("0 8 * * *", async () => {
        console.log("⏳ Ejecutando tarea de recordatorio de turnos...");
        await sendAppointmentReminders()
    })
}