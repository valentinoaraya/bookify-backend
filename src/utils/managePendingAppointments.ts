import moment from "moment-timezone";
import ServiceModel from "../models/Service";
import cron from "node-cron";
import mongoose from "mongoose";
import { io } from "../index"

export const markAppointmentAsPending = async (
    serviceId: string,
    date: Date,
    userId: string
): Promise<string | null> => {
    try {
        const expiresAt = moment().add(15, 'minutes').toDate();
        const pendingId = new mongoose.Types.ObjectId();

        const result = await ServiceModel.findByIdAndUpdate(
            serviceId,
            {
                $push: {
                    pendingAppointments: {
                        _id: pendingId,
                        datetime: date,
                        expiresAt: expiresAt,
                        userId: userId
                    }
                }
            },
            { new: true }
        ).lean();

        if (!result) return null

        const pendingAppointments = result.pendingAppointments.map(pendingApp => ({
            ...pendingApp,
            datetime: moment(pendingApp.datetime).tz('America/Argentina/Buenos_Aires').format('YYYY-MM-DD HH:mm')
        }))

        io.to(result.companyId.toString()).emit("company:service-updated", { ...result, pendingAppointments })

        return pendingId.toString();
    } catch (error) {
        console.error('Error al marcar turno como pendiente:', error);
        return null;
    }
};

export const cleanupExpiredPendingAppointments = async (): Promise<void> => {
    try {
        const now = new Date();

        const services = await ServiceModel.find({
            'pendingAppointments.expiresAt': { $lt: now }
        });

        for (const service of services) {
            const validPendingAppointments = service.pendingAppointments.filter(
                pending => pending.expiresAt > now
            );

            const serviceToSend = await ServiceModel.findByIdAndUpdate(
                service._id,
                {
                    $set: { pendingAppointments: validPendingAppointments }
                },
                { new: true }
            ).lean();

            const availableAppointments = serviceToSend!.availableAppointments.map(app => ({
                ...app,
                datetime: moment(app.datetime).tz('America/Argentina/Buenos_Aires').format('YYYY-MM-DD HH:mm')
            }))

            const scheduledAppointments = serviceToSend!.scheduledAppointments.map(date => moment(date).tz('America/Argentina/Buenos_Aires').format('YYYY-MM-DD HH:mm'))

            const pendingAppointments = serviceToSend!.pendingAppointments.map(pendingApp => ({
                ...pendingApp,
                datetime: moment(pendingApp.datetime).tz('America/Argentina/Buenos_Aires').format('YYYY-MM-DD HH:mm')
            }))

            io.to(serviceToSend!.companyId.toString()).emit("company:service-updated", { ...serviceToSend, pendingAppointments, availableAppointments, scheduledAppointments })
        }

        console.log('Turnos pendientes expirados limpiados exitosamente');
    } catch (error) {
        console.error('Error al limpiar turnos pendientes expirados:', error);
    }
};

export const isAppointmentAvailable = async (
    serviceId: string,
    date: Date,
    userId?: string
): Promise<boolean> => {
    try {
        const service = await ServiceModel.findById(serviceId).lean();

        if (!service) return false;

        const availableAppointment = service.availableAppointments.find(
            app => app.datetime.getTime() === date.getTime()
        );

        if (!availableAppointment) return false;

        const capacity = availableAppointment.capacity;
        const alreadyTaken = availableAppointment.taken || 0;

        const now = new Date();
        const pendingForDate = (service.pendingAppointments || []).filter(
            pending => pending.datetime.getTime() === date.getTime() && pending.expiresAt > now
        );

        const pendingByOtherUsers = pendingForDate.filter(p => !userId || p.userId !== userId);

        return (alreadyTaken + pendingByOtherUsers.length) < capacity;
    } catch (error) {
        console.error('Error al verificar disponibilidad del turno:', error);
        return false;
    }
};

export const removePendingAppointment = async (
    serviceId: string,
    pendingId: string
): Promise<boolean> => {

    console.log("Service ID:", serviceId)
    console.log("Pending ID:", pendingId)

    try {
        const result = await ServiceModel.findByIdAndUpdate(
            serviceId,
            {
                $pull: {
                    pendingAppointments: {
                        _id: new mongoose.Types.ObjectId(pendingId)
                    }
                }
            },
            { new: true }
        ).lean();

        if (result) {
            console.log(`✅ Turno removido de pendingAppointments con _id ${pendingId}`);
            io.to(result.companyId!.toString()).emit("company:service-updated", {
                ...result,
                availableAppointments: result.availableAppointments.map(app => ({
                    ...app,
                    datetime: moment(app.datetime).tz('America/Argentina/Buenos_Aires').format('YYYY-MM-DD HH:mm')
                })),
                pendingAppointments: result.pendingAppointments.map(pending => ({
                    ...pending,
                    datetime: moment(pending.datetime).tz('America/Argentina/Buenos_Aires').format('YYYY-MM-DD HH:mm')
                })),
                scheduledAppointments: result.scheduledAppointments.map(date => moment(date).tz('America/Argentina/Buenos_Aires').format('YYYY-MM-DD HH:mm'))
            })
            return true;
        }

        return false;
    } catch (error) {
        console.error('Error al remover turno de pendingAppointments:', error);
        return false;
    }
};

export const startCleanupPendingAppointments = () => {
    cron.schedule("*/5 * * * *", async () => {
        console.log("⏳ Ejecutando limpieza de turnos pendientes expirados...");
        await cleanupExpiredPendingAppointments();
    });
}; 