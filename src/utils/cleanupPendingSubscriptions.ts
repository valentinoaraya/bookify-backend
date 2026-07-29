import cron from "node-cron"
import { composition } from "../composition"
import { logger } from "../shared/logger"

const STALE_RETENTION_DAYS = 3

/**
 * Cron diario:
 * - elimina empresas con suscripción `pending` de más de 3 días
 * - aborta upgrades stuck y recupera downgrading/cancelling stale
 */
export const startCleanupPendingSubscriptions = () => {
    cron.schedule(
        "30 0 * * *",
        async () => {
            logger.info("Ejecutando limpieza de suscripciones stale...")
            try {
                const pending =
                    await composition.subscriptionService.cleanupStalePending(
                        STALE_RETENTION_DAYS
                    )
                const transitions =
                    await composition.subscriptionService.cleanupStaleTransitions(
                        STALE_RETENTION_DAYS
                    )
                logger.info(
                    {
                        cleanedPending: pending.cleaned,
                        abortedUpgrades: transitions.abortedUpgrades,
                        fixedOther: transitions.fixedOther,
                    },
                    "Limpieza de suscripciones finalizada"
                )
            } catch (error) {
                logger.error({ err: error }, "Error en limpieza de suscripciones")
            }
        },
        {
            timezone: "America/Argentina/Buenos_Aires",
        }
    )
}
