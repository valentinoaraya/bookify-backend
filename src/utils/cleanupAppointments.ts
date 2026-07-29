import cron from "node-cron"
import moment from "moment-timezone"
import AppointmentModel from "../models/Appointment"
import SlotModel from "../modules/slot/slot.model"
import { reminderQueue } from "../queues/reminderQueue"

/**
 * Cron diario:
 * - Turnos `scheduled` con date < hoy → status `pending_action`
 * - Slots con datetime < hoy y taken === 0 → delete
 * No muta arrays embebidos de Service (agenda vive en colección slots).
 */
const deleteOldAppointments = async () => {
    try {
        const todayString = moment().tz("America/Argentina/Buenos_Aires").format("YYYY-MM-DD")
        console.log(`✏️  Actualizando turnos anteriores a ${todayString}...`)

        const todayDate = moment().tz("America/Argentina/Buenos_Aires").toDate()

        // Vaciar `reminderJobs` no alcanza: los jobs siguen encolados en Redis y
        // el worker terminaría mandando recordatorios de turnos ya vencidos.
        const staleAppointments = await AppointmentModel.find(
            { date: { $lt: todayDate }, status: "scheduled" },
            { reminderJobs: 1 }
        ).lean()

        const removedJobs = await removeReminderJobs(
            staleAppointments.flatMap((appointment) => appointment.reminderJobs || [])
        )

        const resultScheduledAppointemnts = await AppointmentModel.updateMany(
            {
                date: { $lt: todayDate },
                status: "scheduled",
            },
            {
                $set: {
                    status: "pending_action",
                    reminderJobs: [],
                },
            }
        )

        const pastEmptySlots = await SlotModel.deleteMany({
            datetime: { $lt: todayDate },
            taken: 0,
        })

        console.log(
            `✏️  ${resultScheduledAppointemnts.modifiedCount} turnos agendados → pending_action.`
        )
        console.log(
            `🗑️  ${pastEmptySlots.deletedCount || 0} slots vacíos pasados eliminados.`
        )
        console.log(`🗑️  ${removedJobs} recordatorios pendientes eliminados de la cola.`)
    } catch (error: any) {
        console.error(error)
    }
}

const removeReminderJobs = async (jobIds: string[]): Promise<number> => {
    let removed = 0
    for (const jobId of jobIds) {
        try {
            const job = await reminderQueue.getJob(jobId)
            if (job) {
                await job.remove()
                removed++
            }
        } catch (error) {
            console.error(`❌ Error al eliminar el job ${jobId}:`, error)
        }
    }
    return removed
}

export const startCleanupAppointments = () => {
    cron.schedule(
        "0 0 * * *",
        async () => {
            console.log("⏳ Ejecutando limpieza de turnos/slots pasados...")
            await deleteOldAppointments()
        },
        {
            timezone: "America/Argentina/Buenos_Aires",
        }
    )
}
