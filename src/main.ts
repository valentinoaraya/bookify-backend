import { createApp } from "./app"
import { startServer } from "./server"
import { connectDatabase } from "./shared/database/connection"
import { startCleanupAppointments } from "./utils/cleanupAppointments"
import { startCleanupPendingSubscriptions } from "./utils/cleanupPendingSubscriptions"
import { startRefreshMercadoPagoTokens } from "./utils/refreshMercadoPagoTokens"
import { startRetryPendingRefunds } from "./utils/retryPendingRefunds"
import { logger } from "./shared/logger"

const bootstrap = async () => {
    try {
        await connectDatabase()

        startCleanupAppointments()
        startCleanupPendingSubscriptions()
        startRefreshMercadoPagoTokens()
        startRetryPendingRefunds()

        const app = createApp()
        startServer(app)
    } catch (error) {
        logger.error({ err: error }, "Error al iniciar la aplicación")
        process.exit(1)
    }
}

bootstrap()
