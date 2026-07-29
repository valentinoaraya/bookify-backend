import { Request, Response, NextFunction } from "express"
import { ZodError } from "zod"
import { AppError, ConflictError } from "./AppError"
import { logger } from "../logger"

function isMongoDuplicateKeyError(
    err: unknown
): err is Error & { code: number; keyPattern?: Record<string, unknown> } {
    return (
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        (err as { code?: number }).code === 11000
    )
}

function duplicateKeyMessage(err: {
    keyPattern?: Record<string, unknown>
}): string {
    const keys = Object.keys(err.keyPattern ?? {})
    if (keys.includes("email")) {
        return "Ya existe una empresa con este email."
    }
    if (keys.includes("company_id")) {
        return "No se pudo generar un identificador único. Intentá de nuevo."
    }
    return "Ya existe un registro con esos datos."
}

/**
 * Middleware global de errores.
 * Mantiene el contrato actual del frontend: `{ error: string }`.
 */
export const errorMiddleware = (
    err: unknown,
    _req: Request,
    res: Response,
    _next: NextFunction
): void => {
    if (err instanceof AppError) {
        const body: { error: string; code?: string; message?: string } = {
            error: err.code === "TOKEN_EXPIRED" ? "Token expirado" : err.message,
        }
        if (err.code) {
            body.code = err.code
            body.message = err.message
        }
        res.status(err.statusCode).send(body)
        return
    }

    if (err instanceof ZodError) {
        const firstIssue = err.issues[0]
        const message = firstIssue
            ? `${firstIssue.path.join(".")}: ${firstIssue.message}`
            : "Datos inválidos"
        res.status(400).send({ error: message })
        return
    }

    if (isMongoDuplicateKeyError(err)) {
        const conflict = new ConflictError(duplicateKeyMessage(err))
        res.status(conflict.statusCode).send({ error: conflict.message })
        return
    }

    if (err instanceof Error) {
        logger.error({ err }, "Error no controlado")
        res.status(500).send({ error: err.message || "Error interno del servidor" })
        return
    }

    logger.error({ err }, "Error desconocido")
    res.status(500).send({ error: "Error interno del servidor" })
}
