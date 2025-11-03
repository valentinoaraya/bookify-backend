import mongoose from "mongoose";
import ServiceModel from "../models/Service";
import AppointmentModel from "../models/Appointment";
import { MONGOOSE_URL } from "../config";

/**
 * Script de migración para asegurar que todos los Services y Appointments
 * tengan el campo mode con valor "online" cuando no esté definido.
 */
const migrateModeOnline = async () => {
    try {
        console.log("🔄 Iniciando migración para establecer mode: \"online\" en Services y Appointments...");

        // Conectar a MongoDB
        await mongoose.connect(MONGOOSE_URL as string);
        console.log("✅ Conectado a MongoDB");

        // Actualizar Services
        const serviceResult = await ServiceModel.updateMany(
            { $set: { mode: "online" } }
        );

        console.log(`✅ Services actualizados: ${serviceResult.modifiedCount}`);

        // Actualizar Appointments
        const appointmentResult = await AppointmentModel.updateMany(
            { $set: { mode: "online" } }
        );

        console.log(`✅ Appointments actualizados: ${appointmentResult.modifiedCount}`);

        // Verificación
        const remainingServices = await ServiceModel.countDocuments({ mode: { $exists: false } });
        const remainingAppointments = await AppointmentModel.countDocuments({ mode: { $exists: false } });

        if (remainingServices === 0 && remainingAppointments === 0) {
            console.log("🎉 Todos los Services y Appointments tienen el campo mode.");
        } else {
            console.log(`⚠️  Restantes sin mode -> Services: ${remainingServices}, Appointments: ${remainingAppointments}`);
        }

    } catch (error) {
        console.error("❌ Error durante la migración:", error);
    } finally {
        // Cerrar la conexión
        await mongoose.disconnect();
        console.log("🔌 Conexión a MongoDB cerrada.");
    }
};

// Ejecutar la migración si se llama directamente
if (require.main === module) {
    migrateModeOnline();
}

export { migrateModeOnline };