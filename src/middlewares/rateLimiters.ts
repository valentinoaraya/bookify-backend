import { rateLimit, MINUTE } from "express-rate-limit"

const tooManyRequests = {
    error: "Demasiadas solicitudes. Esperá unos minutos e intentá de nuevo.",
}

const baseOptions = {
    standardHeaders: "draft-8" as const,
    legacyHeaders: false,
    message: tooManyRequests,
}

/** Red de contención general por IP. */
export const globalLimiter = rateLimit({
    ...baseOptions,
    windowMs: 15 * MINUTE,
    limit: 600,
})

/**
 * Endpoints públicos que escriben en la agenda, disparan cobros o envían mails.
 * Sin esto, cualquiera puede llenar la agenda de una empresa o usar el sistema
 * para mandar correos masivos.
 */
export const bookingLimiter = rateLimit({
    ...baseOptions,
    windowMs: 10 * MINUTE,
    limit: 15,
})

/** Login y recupero de contraseña: frena la fuerza bruta de credenciales. */
export const authLimiter = rateLimit({
    ...baseOptions,
    windowMs: 15 * MINUTE,
    limit: 10,
    skipSuccessfulRequests: true,
})
