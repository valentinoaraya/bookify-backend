import cron from "node-cron"
import { logger } from "../shared/logger"
import { AppointmentRepository } from "../modules/appointment/appointment.repository"
import { CompanyRepository } from "../modules/company/company.repository"
import { PaymentRepository } from "../modules/payment/payment.repository"
import { MercadoPagoPaymentGateway } from "../modules/payment/refund.gateway"
import { calculateRefundAmount, RefundActor } from "../modules/payment/refund-policy"

const paymentRepository = new PaymentRepository()
const appointmentRepository = new AppointmentRepository()
const companyRepository = new CompanyRepository()
const paymentGateway = new MercadoPagoPaymentGateway()

/**
 * Reintenta los reembolsos que Mercado Pago rechazó al cancelar un turno. La
 * cancelación no se bloquea por un fallo del reembolso, así que estos pagos
 * quedan en `refund_pending` esperando este reintento.
 */
const retryPendingRefunds = async (): Promise<void> => {
    const pendings = await paymentRepository.findByStatus("refund_pending")
    if (pendings.length === 0) return

    logger.info(`Reintentando ${pendings.length} reembolso(s) pendiente(s)...`)

    for (const payment of pendings) {
        try {
            const company = await companyRepository.findById(payment.companyId)
            if (!company?.mp_access_token) {
                logger.error(
                    { paymentId: payment.mpPaymentId },
                    "Sin token de Mercado Pago para reintentar el reembolso"
                )
                continue
            }

            const actor = await resolveRefundActor(payment.appointmentId)
            const amount = calculateRefundAmount(payment.amount, actor)

            const response = await paymentGateway.refund(
                payment.mpPaymentId,
                company.mp_access_token,
                amount
            )

            if (!response) {
                logger.error(
                    { paymentId: payment.mpPaymentId },
                    "El reembolso sigue fallando; se reintentará más tarde"
                )
                continue
            }

            await paymentRepository.markRefunded(payment._id, amount)
            logger.info(
                { paymentId: payment.mpPaymentId, amount },
                "Reembolso pendiente completado"
            )
        } catch (error) {
            logger.error(
                { err: error, paymentId: payment.mpPaymentId },
                "Error al reintentar el reembolso"
            )
        }
    }
}

/** Quien canceló define el porcentaje; ante la duda se devuelve el total. */
const resolveRefundActor = async (
    appointmentId?: unknown
): Promise<RefundActor> => {
    if (!appointmentId) return "company"
    const appointment = await appointmentRepository.findLeanById(String(appointmentId))
    return appointment?.cancelledBy === "client" ? "client" : "company"
}

export const startRetryPendingRefunds = () => {
    cron.schedule(
        "*/30 * * * *",
        async () => {
            await retryPendingRefunds()
        },
        { timezone: "America/Argentina/Buenos_Aires" }
    )
}
