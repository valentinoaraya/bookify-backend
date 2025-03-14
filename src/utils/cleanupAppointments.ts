import cron from "node-cron"
import moment from "moment-timezone"
import AppointmentModel from "../models/Appointment"
import ServiceModel from "../models/Service"

export const deleteOldAppointments = async () => {
    try {
        const today = moment().tz("America/Argentina/Buenos_Aires").format("YYYY-MM-DD");
        console.log(`🗑️  Eliminando turnos anteriores a ${today}...`)

        const resultScheduledAppointemnts = await AppointmentModel.deleteMany({
            date: { $lt: today }
        })
        const resultAvailableAppointemnts = await ServiceModel.updateMany(
            { availableAppointments: { $lt: today } },
            { $pull: { availableAppointments: { $lt: today } } }
        )
        await ServiceModel.updateMany(
            { scheduledAppointments: { $lt: today } },
            { $pull: { scheduledAppointments: { $lt: today } } }
        )

        console.log(`🗑️  ${resultScheduledAppointemnts.deletedCount} turnos agendados eliminados.`)
        console.log(`🗑️  ${resultAvailableAppointemnts.modifiedCount === 1 ? "Turnos sin agendar eliminados." : "No habían turnos sin agendar para eliminar."} `)

    } catch (error: any) {
        console.error(error)
    }
}

export const startCleanupAppointments = () => {
    cron.schedule("05 18 * * *", async () => {
        console.log("⏳ Ejecutando eliminación de turnos pasados...")
        await deleteOldAppointments()
    })
}