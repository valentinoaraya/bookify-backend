import mongoose from "mongoose"
import { env } from "../../config/env"
import { logger } from "../logger"

export const connectDatabase = async (): Promise<typeof mongoose> => {
    try {
        const connection = await mongoose.connect(env.MONGODB_URL_CONNECTION)
        const dbName = connection.connection.name
        logger.info(
            {
                nodeEnv: env.NODE_ENV,
                database: dbName,
                emailMode:
                    env.NODE_ENV === "development"
                        ? `redirect → ${env.DEV_EMAIL_REDIRECT}`
                        : "real recipients",
            },
            "Connected to MongoDB"
        )
        if (env.NODE_ENV === "development" && dbName === "bookifydb") {
            logger.error(
                "⚠️  Estás en development apuntando a bookifydb (PRODUCCIÓN). Cambiá a bookifydb-dev."
            )
        }
        return connection
    } catch (error) {
        logger.error({ err: error }, "Failed to connect to MongoDB")
        throw error
    }
}

export const disconnectDatabase = async (): Promise<void> => {
    await mongoose.disconnect()
}
