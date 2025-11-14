import mongoose from "mongoose";
import ServiceModel from "../models/Service";
import { MONGOOSE_URL } from "../config";

const migrateActiveTrue = async () => {
    try {
        console.log("🔄 Iniciando migración para establecer active: \"true\" en Services...");

        // Conectar a MongoDB
        await mongoose.connect(MONGOOSE_URL as string);
        console.log("✅ Conectado a MongoDB");

        // Actualizar Services
        const serviceResult = await ServiceModel.updateMany(
            { active: { $exists: false } },
            { $set: { active: true } }
        );

        console.log(`✅ Services actualizados: ${serviceResult.modifiedCount}`);

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
    migrateActiveTrue();
}

export { migrateActiveTrue };