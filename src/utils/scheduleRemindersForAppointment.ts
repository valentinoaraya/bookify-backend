import moment from "moment-timezone";
import { reminderQueue } from "../queues/reminderQueue";
import AppointmentModel from "../models/Appointment";

export const scheduleRemindersForAppointment = async (appointmentId: string) => {
    try {
        const appointment = await AppointmentModel.findById(appointmentId)
            .populate("serviceId", "_id title")
            .populate("companyId", "name reminders");

        if (!appointment) throw new Error("Turno no existente.");

        const company: any = appointment.companyId;
        const startTime = moment(appointment.date).tz("America/Argentina/Buenos_Aires");

        for (const reminder of company.reminders) {
            const { hoursBefore, services } = reminder;

            if (!services.some((s: any) => s.equals(appointment.serviceId._id))) continue;

            const jobTime = startTime.clone().subtract(hoursBefore, "hours");
            const delay = jobTime.diff(moment());

            if (delay <= 0) continue;

            const job = await reminderQueue.add(
                "sendReminder",
                {
                    appointmentId: appointment._id.toString(),
                    companyId: company._id.toString(),
                    hoursBefore,
                },
                {
                    delay,
                    attempts: 3,
                    removeOnComplete: true,
                    removeOnFail: false,
                }
            );

            if (job.id) {
                appointment.reminderJobs.push(job.id)
                await appointment.save()
            }

            console.log(
                `📌 Job programado: ${hoursBefore}h antes del turno ${appointment._id} para ${company.name}`
            );
        }
    } catch (error: any) {
        console.error("Error al agendar el job:", error)
    }
};
