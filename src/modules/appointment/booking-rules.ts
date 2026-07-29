import moment from "moment-timezone"
import { ValidationError } from "../../shared/errors"

export const formatAnticipationMessage = (hours: number): string => {
    if (hours > 24) {
        const days = hours / 24
        return `${days} ${days === 1 ? "día" : "días"}`
    }
    return `${hours} ${hours === 1 ? "hora" : "horas"}`
}

export type BookableCheck = { ok: true } | { ok: false; reason: string }

/**
 * Reglas que hacen imposible el turno, sin importar por dónde entre la reserva.
 * Se chequean también en el flujo del webhook, donde un incumplimiento deriva en
 * reembolso en lugar de error.
 */
export const checkBookable = (
    service: { active?: boolean },
    date: Date
): BookableCheck => {
    if (service.active === false) {
        return { ok: false, reason: "El servicio ya no está disponible para reservas." }
    }

    const target = moment(date)
    if (!target.isValid()) {
        return { ok: false, reason: "Fecha del turno inválida." }
    }
    if (target.isSameOrBefore(moment())) {
        return {
            ok: false,
            reason: "No es posible reservar un turno en un horario que ya pasó.",
        }
    }

    return { ok: true }
}

export const assertBookable = (service: { active?: boolean }, date: Date): void => {
    const result = checkBookable(service, date)
    if (!result.ok) throw new ValidationError(result.reason)
}

/**
 * Anticipación mínima configurada por la empresa. Se valida en los puntos de
 * entrada del cliente (reserva directa y creación de preferencia de pago), no en
 * el webhook: ahí el pago ya está hecho y la reserva temporal lo cubría.
 */
export const assertBookingAnticipation = (
    company: { bookingAnticipationHours: number },
    date: Date
): void => {
    const limit = moment(date).subtract(company.bookingAnticipationHours, "hours")
    if (moment().isSameOrAfter(limit)) {
        throw new ValidationError(
            `No es posible agendar el turno en este momento. Las agendas se realizan ${formatAnticipationMessage(
                company.bookingAnticipationHours
            )} antes del horario del turno.`
        )
    }
}
