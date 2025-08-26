import mongoose from "mongoose";
import ServiceModel from "../models/Service";
import { MONGOOSE_URL } from "../config";

/**
 * Script de migración para agregar el campo pendingAppointments
 * a todos los servicios existentes
 */
const migratePendingAppointments = async () => {
    try {
        console.log("🔄 Iniciando migración para agregar campo pendingAppointments...");

        // Conectar a MongoDB
        await mongoose.connect(MONGOOSE_URL as string);
        console.log("✅ Conectado a MongoDB");

        // Actualizar todos los servicios que no tengan el campo pendingAppointments
        const result = await ServiceModel.updateMany(
            { pendingAppointments: { $exists: false } },
            { $set: { pendingAppointments: [] } }
        );

        console.log(`✅ Migración completada. ${result.modifiedCount} servicios actualizados.`);

        // Verificar que todos los servicios tengan el campo
        const servicesWithoutField = await ServiceModel.countDocuments({
            pendingAppointments: { $exists: false }
        });

        if (servicesWithoutField === 0) {
            console.log("✅ Todos los servicios tienen el campo pendingAppointments.");
        } else {
            console.log(`⚠️  ${servicesWithoutField} servicios aún no tienen el campo pendingAppointments.`);
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
    migratePendingAppointments();
}

export { migratePendingAppointments }; 