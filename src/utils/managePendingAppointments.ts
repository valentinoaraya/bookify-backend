import moment from "moment-timezone";
import ServiceModel from "../models/Service";
import cron from "node-cron";

export const markAppointmentAsPending = async (
    serviceId: string,
    date: Date,
    userId: string
): Promise<boolean> => {
    try {
        const expiresAt = moment().add(15, 'minutes').toDate();

        const result = await ServiceModel.findByIdAndUpdate(
            serviceId,
            {
                $push: {
                    pendingAppointments: {
                        datetime: date,
                        expiresAt: expiresAt,
                        userId: userId
                    }
                }
            },
            { new: true }
        );

        return !!result;
    } catch (error) {
        console.error('Error al marcar turno como pendiente:', error);
        return false;
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

            await ServiceModel.findByIdAndUpdate(
                service._id,
                {
                    $set: { pendingAppointments: validPendingAppointments }
                }
            );
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
    date: Date,
    userId: string
): Promise<boolean> => {
    try {
        const result = await ServiceModel.findByIdAndUpdate(
            serviceId,
            {
                $pull: {
                    pendingAppointments: {
                        datetime: date,
                        userId: userId
                    }
                }
            },
            { new: true }
        );

        if (result) {
            console.log(`✅ Turno removido de pendingAppointments para ${userId}`);
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