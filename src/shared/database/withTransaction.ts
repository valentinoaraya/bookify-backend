import mongoose, { ClientSession } from "mongoose"
import { env } from "../../config/env"
import { logger } from "../logger"

export type WithTransactionFn<T> = (session: ClientSession | null) => Promise<T>

function isReplicaSetUnavailableError(error: unknown): boolean {
    const message = String(
        (error as { message?: string })?.message ?? error ?? ""
    ).toLowerCase()
    return (
        message.includes("transaction numbers are only allowed") ||
        message.includes("replica set") ||
        message.includes("not a member of a replica set") ||
        message.includes("transactions are not supported") ||
        message.includes("illegaloperation")
    )
}

/**
 * Ejecuta `fn` dentro de una transacción MongoDB.
 * En `NODE_ENV=test`, si no hay replica set, hace fallback sin sesión.
 */
export async function withTransaction<T>(fn: WithTransactionFn<T>): Promise<T> {
    let session: ClientSession | null = null

    try {
        session = await mongoose.startSession()
    } catch (error) {
        if (env.NODE_ENV === "test") {
            logger.warn(
                { err: error },
                "withTransaction: no se pudo abrir sesión; fallback sin transacción (test)"
            )
            return fn(null)
        }
        throw error
    }

    try {
        let result!: T
        await session.withTransaction(async () => {
            result = await fn(session)
        })
        return result
    } catch (error) {
        if (env.NODE_ENV === "test" && isReplicaSetUnavailableError(error)) {
            logger.warn(
                { err: error },
                "withTransaction: replica set no disponible; fallback sin transacción (test)"
            )
            return fn(null)
        }
        throw error
    } finally {
        await session.endSession()
    }
}
