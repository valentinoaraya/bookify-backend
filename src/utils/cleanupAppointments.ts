import cron from "node-cron"
import moment from "moment"
import AppointmentModel from "../models/Appointment"
import ServiceModel from "../models/Service"

export const deleteOldAppointments = async () => {
    try {
        const yesterday = moment().subtract(1, "days").format("YYYY-MM-DD")
        console.log(`🗑️  Eliminando turnos anteriores a ${yesterday}...`)

        const resultScheduledAppointemnts = await AppointmentModel.deleteMany({
            date: { $regex: `^${yesterday}` }
        })
        const resultAvailableAppointemnts = await ServiceModel.updateMany(
            { availableAppointments: { $regex: `^${yesterday}` } },
            { $pull: { availableAppointments: { $regex: `^${yesterday}` } } }
        )
        await ServiceModel.updateMany(
            { scheduledAppointments: { $regex: `^${yesterday}` } },
            { $pull: { scheduledAppointments: { $regex: `^${yesterday}` } } }
        )

        console.log(`🗑️  ${resultScheduledAppointemnts.deletedCount} turnos agendados eliminados.`)
        console.log(`🗑️  ${resultAvailableAppointemnts.modifiedCount} turnos sin agendar eliminados.`)

    } catch (error: any) {
        console.error(error)
    }
}

export const startCleanupAppointments = () => {
    cron.schedule("0 0 * * *", async () => {
        console.log("⏳ Ejecutando eliminación de turnos pasados...")
        await deleteOldAppointments()
    })
}