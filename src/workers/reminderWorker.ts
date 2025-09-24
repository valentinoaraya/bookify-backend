import { Worker } from "bullmq";
import AppointmentModel from "../models/Appointment";
import { sendEmail } from "../services/emailService";
import moment from "moment-timezone";
import { formatDate } from "../utils/formatDate";
import { MONGOOSE_URL, REDIS_HOST, REDIS_PORT } from "../config";
import mongoose from "mongoose";
import "../models/Service"
import "../models/Company"

(async () => {
    try {
        await mongoose.connect(MONGOOSE_URL as string)
        console.log("✅ Worker conectado a MongoDB");
    } catch (err) {
        console.error("❌ Error conectando a MongoDB en el worker:", err);
    }
})()

export const reminderWorker = new Worker(
    "reminders",
    async (job) => {
        const { appointmentId, hoursBefore } = job.data;

        const appointment = await AppointmentModel.findById(appointmentId)
            .populate<{ serviceId: { title: string } }>("serviceId", "title")
            .populate<{ companyId: { name: string } }>("companyId", "name");

        if (!appointment) {
            console.log(`⚠️ Turno ${appointmentId} no encontrado`);
            return;
        }

        const appointmentDate = moment(appointment.date).tz("America/Argentina/Buenos_Aires");
        const dateInString = appointmentDate.format("YYYY-MM-DD HH:mm");

        let timeMessage = ""
        if (hoursBefore === 24) {
            timeMessage = "mañana"
        } else if (hoursBefore > 24) {
            timeMessage = `en ${hoursBefore / 24} ${hoursBefore / 24 === 1 ? "día" : "días"}`
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
            await sendEmail(appointment.email, subject, textMessage, htmlMessage);
            console.log(`✅ Recordatorio enviado a ${appointment.email} (${hoursBefore}h antes)`);
        } catch (err) {
            console.error(`❌ Error enviando recordatorio a ${appointment.email}:`, err);
        }
    },
    {
        connection: { host: REDIS_HOST, port: REDIS_PORT ? parseInt(REDIS_PORT) : 6379 },
    }
);

reminderWorker.on("completed", (job) => {
    console.log(`✅ Job ${job.id} completado`);
});

reminderWorker.on("failed", (job, err) => {
    console.error(`❌ Job ${job?.id} falló:`, err);
});