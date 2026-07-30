import http from "http"
import { Express } from "express"
import { env } from "./config/env"
import { initSocket } from "./infrastructure/realtime/socket"
import { logger } from "./shared/logger"

export const createServer = (app: Express) => {
    const server = http.createServer(app)

    initSocket(server, {
        cors: {
            origin: env.FRONTEND_URL,
            methods: ["GET", "POST"],
        },
    })

    return server
}

export const startServer = (app: Express): http.Server => {
    const server = createServer(app)

    server.listen(
        {
            port: env.PORT,
            host: "0.0.0.0",
        },
        () => {
            logger.info(`Server running on port ${env.PORT}`)
        }
    )

    return server
}
