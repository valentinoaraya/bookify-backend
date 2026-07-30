/**
 * Compatibilidad: las reservas pendientes usan TTL de MongoDB
 * (índice expireAfterSeconds sobre pending_reservations.expiresAt).
 * No hay cron de limpieza.
 */
export const startCleanupPendingAppointments = () => {
    // no-op
}
