import moment from "moment-timezone"

export const BA_TIMEZONE = "America/Argentina/Buenos_Aires"
export const DATETIME_FORMAT = "YYYY-MM-DD HH:mm"
export const DATE_FORMAT = "YYYY-MM-DD"

/** Convierte un Date o string a moment en timezone BA. */
export const toBaTz = (date?: Date | string | moment.Moment) => {
    if (!date) return moment.tz(BA_TIMEZONE)
    return moment(date).tz(BA_TIMEZONE)
}

/** Formatea a `YYYY-MM-DD HH:mm` en timezone BA. */
export const formatDateTime = (date: Date | string | moment.Moment): string => {
    return toBaTz(date).format(DATETIME_FORMAT)
}

/** Formatea solo la fecha `YYYY-MM-DD` en timezone BA. */
export const formatDateOnly = (date: Date | string | moment.Moment): string => {
    return toBaTz(date).format(DATE_FORMAT)
}

/**
 * Parsea un string `YYYY-MM-DD HH:mm` interpretándolo en timezone BA
 * y devuelve el Date UTC correspondiente.
 */
export const parseBaTz = (dateTimeString: string): Date => {
    return moment.tz(dateTimeString, DATETIME_FORMAT, BA_TIMEZONE).toDate()
}

/** Moment "ahora" en timezone BA. */
export const nowBaTz = () => moment.tz(BA_TIMEZONE)
