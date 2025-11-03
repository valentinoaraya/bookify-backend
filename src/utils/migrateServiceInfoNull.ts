import mongoose from "mongoose";
import AppointmentModel from "../models/Appointment";
import { MONGOOSE_URL } from "../config";

/**
 * Script de migración para agregar el campo serviceInfo con valor null
 * a todos los documentos de la colección Appointments.
 */
const migrateServiceInfoNull = async () => {
    try {
        console.log("🔄 Iniciando migración para establecer serviceInfo: null en Appointments...");

        // Conectar a MongoDB
        await mongoose.connect(MONGOOSE_URL as string);
        console.log("✅ Conectado a MongoDB");

        // Establecer serviceInfo: null en todos los Appointments
        const result = await AppointmentModel.updateMany({}, { $set: { serviceInfo: null } });
        console.log(`✅ Appointments actualizados: ${result.modifiedCount}`);

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
    migrateServiceInfoNull();
}

export { migrateServiceInfoNull };


