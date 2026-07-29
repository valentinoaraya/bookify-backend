import nodemailer from "nodemailer"
import { env } from "../../config/env"
import { logger } from "../../shared/logger"

export const isValidEmail = (email: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export const normalizeEmail = (email: string) => {
    if (!email) return ""
    if (!isValidEmail(email)) return ""
    return email.trim().toLowerCase().replace(/\.+$/, "")
}

/**
 * Gateway de email (Nodemailer / Brevo SMTP).
 * En development redirige todos los destinatarios a DEV_EMAIL_REDIRECT.
 * No lanza errores al fallar el envío: loguea y continúa (comportamiento legacy).
 */
export class EmailGateway {
    private readonly transporter = nodemailer.createTransport({
        host: env.NODEMAILER_HOST,
        port: env.NODEMAILER_PORT,
        secure: false,
        auth: {
            user: env.NODEMAILER_USER,
            pass: env.NODEMAILER_PASSWORD,
        },
    })

    async send(to: string, subject: string, text: string, html: string): Promise<void> {
        try {
            const normalized = normalizeEmail(to)
            if (!normalized) {
                logger.error("❌ Correo inválido proporcionado.")
                return
            }

            let destination = normalized
            let finalSubject = subject

            if (env.NODE_ENV === "development" && env.DEV_EMAIL_REDIRECT) {
                destination = normalizeEmail(env.DEV_EMAIL_REDIRECT) || env.DEV_EMAIL_REDIRECT
                finalSubject = `[DEV → ${normalized}] ${subject}`
                logger.info(
                    `📧 [DEV] Redirigiendo email de ${normalized} → ${destination}`
                )
            }

            await this.transporter.sendMail({
                from: env.EMAIL_FROM,
                to: destination,
                subject: finalSubject,
                text,
                html,
            })
            logger.info(`📧 Correo enviado a ${destination}`)
        } catch (error) {
            logger.error({ err: error }, "❌ Error enviando el correo")
        }
    }
}
