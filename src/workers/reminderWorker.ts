import { Worker } from "bullmq";
import AppointmentModel from "../models/Appointment";
import { sendEmail } from "../services/emailService";
import moment from "moment-timezone";
import { formatDate } from "../utils/formatDate";
import { FRONTEND_URL, MONGOOSE_URL, REDIS_HOST, REDIS_PORT } from "../config";
import mongoose from "mongoose";
import { signCancelToken } from "../modules/appointment/cancel-token";
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

        if (appointment.status !== "scheduled") {
            console.log(`⚠️ Turno ${appointmentId} en estado ${appointment.status}: no se envía recordatorio`);
            return;
        }

        const appointmentDate = moment(appointment.date).tz("America/Argentina/Buenos_Aires");
        const dateInString = appointmentDate.format("YYYY-MM-DD HH:mm");

        const cancelUrl = `${FRONTEND_URL}/cancel/${signCancelToken(appointment._id, appointment.date)}`

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
                    \nTe recordamos que tienes un turno ${timeMessage} ${appointment.mode === "in-person" ? "en" : "con"} ${appointment.companyId.name} para ${appointment.serviceId.title}.\n
                    \nFecha: ${formatDate(dateInString.split(' ')[0])} 
                    \nHora: ${dateInString.split(' ')[1]}\n
                    \n${appointment.mode === "in-person" ? "¡No olvides asistir!" : appointment.mode === "online" ? "¡No olvides conectarte!" : "Recuerda que el servicio es presencial a domicilio, el personal irá al lugar de encuentro."}\n
                    \nSi no puedes asistir o concretar el encuentro, puedes cancelar haciendo click en el siguiente enlace: ${cancelUrl}`


        const htmlMessage = `<p>Hola ${appointment.name},</p>
                    <p>Te recordamos que tienes un turno ${timeMessage} ${appointment.mode === "in-person" ? "en" : "con"} <strong>${appointment.companyId.name}</strong> para <strong>${appointment.serviceId.title}</strong>.</p>
                    <p>Fecha: ${formatDate(dateInString.split(' ')[0])}</p>
                    <p>Hora: ${dateInString.split(' ')[1]}</p>
                    <p>${appointment.mode === "in-person" ? "¡No olvides asistir!" : appointment.mode === "online" ? "¡No olvides conectarte!" : "Recuerda que el servicio es presencial a domicilio, el personal irá al lugar de encuentro."}</p>
                    <p>Si no puedes asistir o concretar el encuentro, puedes cancelarlo haciendo click en el siguiente botón:</p>           
                    <p>
                        <a href="${cancelUrl}" 
                            style="display:inline-block;padding:10px 15px;background-color:#d9534f;color:white;text-decoration:none;border-radius:5px;">
                            Cancelar turno
                        </a>
                    </p>`


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