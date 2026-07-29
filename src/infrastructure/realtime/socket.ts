import { Server as HttpServer } from "http"
import { Server, ServerOptions } from "socket.io"
import { logger } from "../../shared/logger"

let io: Server | null = null

export const initSocket = (httpServer: HttpServer, options?: Partial<ServerOptions>): Server => {
    io = new Server(httpServer, options)

    io.on("connection", (socket) => {
        logger.info(`Cliente conectado: ${socket.id}`)

        socket.on("joinCompany", (companyId: string) => {
            if (!companyId) {
                logger.warn(`Cliente ${socket.id} intentó unirse sin companyId`)
                return
            }
            socket.join(companyId)
            logger.info(`Cliente ${socket.id} unido a la empresa ${companyId}`)
        })

        socket.on("disconnect", () => {
            logger.info(`Cliente desconectado: ${socket.id}`)
        })
    })

    return io
}

/**
 * Obtiene la instancia de Socket.io.
 * Lanza si se llama antes de `initSocket` (excepto en tests donde se puede settear).
 */
export const getIO = (): Server => {
    if (!io) {
        throw new Error("Socket.io no inicializado. Llamá a initSocket() primero.")
    }
    return io
}

/** Solo para tests: permite inyectar un mock de Server. */
export const setIO = (server: Server | null): void => {
    io = server
}
