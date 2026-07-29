/**
 * Migración 005: elimina arrays/objetos embebidos ya migrados a colecciones.
 * Idempotente: $unset es no-op si el campo no existe.
 *
 * Usa el driver nativo (no Mongoose) porque esos campos ya no están en el schema
 * y `strict` descartaría el $unset.
 *
 * Service: availableAppointments, scheduledAppointments, pendingAppointments
 * Company: scheduledAppointments, suscription
 */
import mongoose from "mongoose"
import { env } from "../config/env"

const unsetEmbeddedArrays = async () => {
    await mongoose.connect(env.MONGODB_URL_CONNECTION)
    console.log("✅ Conectado a MongoDB — unset embedded arrays")

    const db = mongoose.connection.db
    if (!db) throw new Error("Sin conexión a MongoDB")

    const serviceResult = await db.collection("services").updateMany(
        {},
        {
            $unset: {
                availableAppointments: "",
                scheduledAppointments: "",
                pendingAppointments: "",
            },
        }
    )

    const companyResult = await db.collection("companies").updateMany(
        {},
        {
            $unset: {
                scheduledAppointments: "",
                suscription: "",
            },
        }
    )

    console.log(
        `✅ Services modificados: ${serviceResult.modifiedCount} (matched ${serviceResult.matchedCount})`
    )
    console.log(
        `✅ Companies modificadas: ${companyResult.modifiedCount} (matched ${companyResult.matchedCount})`
    )

    await mongoose.disconnect()
}

if (require.main === module) {
    unsetEmbeddedArrays().catch((err) => {
        console.error(err)
        process.exit(1)
    })
}

export { unsetEmbeddedArrays }
