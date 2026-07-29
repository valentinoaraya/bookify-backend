/**
 * Compatibilidad: re-exporta el EmailGateway como funciones legacy.
 */
import { EmailGateway, isValidEmail, normalizeEmail } from "../infrastructure/email/email.gateway"

const defaultGateway = new EmailGateway()

export { isValidEmail, normalizeEmail }

export const sendEmail = async (
    to: string,
    subject: string,
    text: string,
    html: string
): Promise<void> => {
    await defaultGateway.send(to, subject, text, html)
}
