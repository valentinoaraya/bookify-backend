import jwt from "jsonwebtoken"
import { Types } from "mongoose"
import { env } from "../../config/env"

const CANCEL_PURPOSE = "cancel"
const GRACE_AFTER_APPOINTMENT_MS = 24 * 60 * 60 * 1000
const MIN_TTL_MS = 60 * 60 * 1000

type CancelTokenPayload = {
    sub?: string
    purpose?: string
}

/**
 * Firma el token que viaja en el link de cancelación enviado por email.
 * Poseer el token equivale a haber recibido el mail del turno, y es lo que
 * habilita a cancelarlo.
 */
export const signCancelToken = (
    appointmentId: string | Types.ObjectId,
    appointmentDate: Date | string
): string => {
    const appointmentMs = new Date(appointmentDate).getTime()
    const expiresAtMs = Number.isNaN(appointmentMs)
        ? Date.now() + MIN_TTL_MS
        : Math.max(
              appointmentMs + GRACE_AFTER_APPOINTMENT_MS,
              Date.now() + MIN_TTL_MS
          )

    return jwt.sign(
        {
            sub: String(appointmentId),
            purpose: CANCEL_PURPOSE,
            exp: Math.floor(expiresAtMs / 1000),
        },
        env.SECRET_JWT_KEY
    )
}

export const verifyCancelToken = (raw: string): string | null => {
    try {
        const decoded = jwt.verify(raw, env.SECRET_JWT_KEY) as CancelTokenPayload
        if (decoded.purpose !== CANCEL_PURPOSE) return null
        if (!decoded.sub || !isObjectId(decoded.sub)) return null
        return decoded.sub
    } catch {
        return null
    }
}

export type AppointmentRef = {
    appointmentId: string
    /** true si vino de un link firmado; false para links viejos con el id crudo. */
    verified: boolean
}

/**
 * Acepta tanto el token firmado como el ObjectId pelado de los links ya
 * enviados. Los links viejos requieren confirmar el email del turno para poder
 * cancelar (ver AppointmentService.cancelByClient).
 */
export const resolveAppointmentRef = (raw: string): AppointmentRef | null => {
    const fromToken = verifyCancelToken(raw)
    if (fromToken) return { appointmentId: fromToken, verified: true }
    if (isObjectId(raw)) return { appointmentId: raw, verified: false }
    return null
}

function isObjectId(value: string): boolean {
    return Types.ObjectId.isValid(value) && new Types.ObjectId(value).toString() === value
}
