import cron from "node-cron"
import moment from "moment-timezone"
import AppointmentModel from "../models/Appointment"
import ServiceModel from "../models/Service"
import CompanyModel from "../models/Company"

const deleteOldAppointments = async () => {
    try {
        const todayString = moment().tz("America/Argentina/Buenos_Aires").format("YYYY-MM-DD");
        console.log(`✏️  Actualizando turnos anteriores a ${todayString}...`)

        const todayDate = moment().tz('America/Argentina/Buenos_Aires').toDate()
        console.log(todayDate)

        const results = await AppointmentModel.find({
            date: { $lt: todayDate }
        })

        if (results.length > 0) {
            const appointmentIds = results.map(app => app._id)
            await CompanyModel.updateMany(
                { scheduledAppointments: { $in: appointmentIds } },
                { $pullAll: { scheduledAppointments: appointmentIds } }
            )
        }

        const resultScheduledAppointemnts = await AppointmentModel.updateMany(
            {
                date: { $lt: todayDate },
                status: "scheduled"
            },
            {
                $set: {
                    status: "pending_action",
                    reminderJobs: []
                }
            }
        )

        const resultAvailableAppointemnts = await ServiceModel.updateMany(
            { "availableAppointments.datetime": { $lt: todayDate } },
            { $pull: { availableAppointments: { datetime: { $lt: todayDate } } } }
        )
        await ServiceModel.updateMany(
            { scheduledAppointments: { $lt: todayDate } },
            { $pull: { scheduledAppointments: { $lt: todayDate } } }
        )

        console.log(`✏️  ${resultScheduledAppointemnts.modifiedCount} turnos agendados editados.`)
        console.log(`🗑️  ${resultAvailableAppointemnts.modifiedCount > 0 ? "Turnos sin agendar eliminados." : "No habían turnos sin agendar para eliminar."} `)

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