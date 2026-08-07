import cron from "node-cron"
import { logger } from "../shared/logger"
import { CompanyRepository } from "../modules/company/company.repository"
import { MercadoPagoPaymentGateway } from "../modules/payment/refund.gateway"
import {
    MpTokenService,
    MP_TOKEN_RENEW_AHEAD_MS,
} from "../modules/payment/mp-token.service"

const companyRepository = new CompanyRepository()
const paymentGateway = new MercadoPagoPaymentGateway()
const mpTokenService = new MpTokenService(companyRepository, paymentGateway)

/**
 * Renueva de forma proactiva los access tokens OAuth de empresas vinculadas,
 * usando `mp_token_expires_at` (no `updatedAt` del perfil).
 */
const refreshMercadoPagoTokens = async (): Promise<void> => {
    try {
        logger.info("Iniciando actualización de tokens de Mercado Pago...")

        const companies = await companyRepository.find({
            connectedWithMP: true,
            mp_refresh_token: { $exists: true, $ne: "" },
        })

        const dueSoon = companies.filter((company) =>
            MpTokenService.needsRefresh(company, Date.now(), MP_TOKEN_RENEW_AHEAD_MS)
        )

        logger.info(
            { count: dueSoon.length },
            "Empresas con tokens próximos a vencer o sin fecha de vencimiento"
        )

        let successCount = 0
        let errorCount = 0

        for (const company of dueSoon) {
            try {
                const token = await mpTokenService.refreshCompanyToken(company)
                if (token) {
                    successCount++
                } else {
                    errorCount++
                }
                await new Promise((resolve) => setTimeout(resolve, 1000))
            } catch (error) {
                logger.error(
                    { err: error, companyId: company._id, companyName: company.name },
                    "Error procesando refresh de token MP"
                )
                errorCount++
            }
        }

        logger.info(
            { successCount, errorCount },
            "Actualización de tokens de Mercado Pago completada"
        )
    } catch (error) {
        logger.error({ err: error }, "Error en refreshMercadoPagoTokens")
    }
}

export const startRefreshMercadoPagoTokens = (): void => {
    cron.schedule(
        "0 2 * * *",
        async () => {
            logger.info(
                "Ejecutando actualización automática de tokens de Mercado Pago..."
            )
            await refreshMercadoPagoTokens()
        },
        { timezone: "America/Argentina/Buenos_Aires" }
    )

    logger.info(
        "Tarea programada de actualización de tokens configurada para las 2:00 AM diarias"
    )
}

/** Exportado para tests / ejecución manual. */
export { refreshMercadoPagoTokens }
