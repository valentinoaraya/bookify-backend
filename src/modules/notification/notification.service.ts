import { EmailGateway } from "../../infrastructure/email/email.gateway"
import * as templates from "../../infrastructure/email/templates"

type Mode = "in-person" | "online" | "in-person-at-home"

/**
 * Servicio de notificaciones: orquesta templates + envío.
 * Los Appointment/Payment/Subscription services lo usan como side-effect post-commit.
 */
export class NotificationService {
    constructor(private readonly emailGateway: EmailGateway) {}

    async sendConfirmAppointment(params: {
        userEmail: string
        userName: string
        companyEmail: string
        companyName: string
        companyAddress: string
        serviceTitle: string
        dateLabel: string
        timeLabel: string
        cancelToken: string
        mode: Mode
    }): Promise<void> {
        const { htmlUser, textUser } = templates.emailConfirmAppointmentUser(
            params.userName,
            params.serviceTitle,
            params.companyName,
            params.companyAddress,
            params.dateLabel,
            params.timeLabel,
            params.cancelToken,
            params.mode
        )
        const { htmlCompany, textCompany } = templates.emailConfirmAppointmentCompany(
            params.companyName,
            params.serviceTitle,
            params.userName,
            params.dateLabel,
            params.timeLabel
        )

        await this.emailGateway.send(
            params.userEmail,
            "✅ Turno confirmado con éxito",
            textUser,
            htmlUser
        )
        await this.emailGateway.send(
            params.companyEmail,
            "📅 Nuevo turno agendado",
            textCompany,
            htmlCompany
        )
    }

    async sendCancelByClient(params: {
        userEmail: string
        userName: string
        companyEmail: string
        companyName: string
        serviceTitle: string
        dateLabel: string
        timeLabel: string
    }): Promise<void> {
        const { htmlUser, textUser } = templates.emailCancelAppointmentUser(
            params.companyName,
            params.userName,
            params.serviceTitle,
            params.dateLabel,
            params.timeLabel
        )
        const { htmlCompany, textCompany } = templates.emailCancelAppointmentCompany(
            params.companyName,
            params.userName,
            params.serviceTitle,
            params.dateLabel,
            params.timeLabel
        )
        await this.emailGateway.send(params.userEmail, "❌ Turno cancelado", textUser, htmlUser)
        await this.emailGateway.send(
            params.companyEmail,
            "❌ Un turno ha sido cancelado",
            textCompany,
            htmlCompany
        )
    }

    async sendCancelByCompany(params: {
        userEmail: string
        userName: string
        companyEmail: string
        companyName: string
        serviceTitle: string
        dateLabel: string
        timeLabel: string
    }): Promise<void> {
        const { htmlUser, textUser } = templates.emailDeleteAppointmentUser(
            params.companyName,
            params.userName,
            params.serviceTitle,
            params.dateLabel,
            params.timeLabel
        )
        const { htmlCompany, textCompany } = templates.emailDeleteAppointmentCompany(
            params.companyName,
            params.userName,
            params.serviceTitle,
            params.dateLabel,
            params.timeLabel
        )
        await this.emailGateway.send(
            params.userEmail,
            "❌ Tu turno ha sido cancelado",
            textUser,
            htmlUser
        )
        await this.emailGateway.send(params.companyEmail, "❌ Turno cancelado", textCompany, htmlCompany)
    }

    async sendRefundUnavailable(params: {
        userEmail: string
        userName: string
        companyName: string
        serviceTitle: string
        dateLabel: string
        timeLabel: string
    }): Promise<void> {
        const { htmlUser, textUser } = templates.emailRefundAppointmentUser(
            params.companyName,
            params.userName,
            params.serviceTitle,
            params.dateLabel,
            params.timeLabel
        )
        await this.emailGateway.send(
            params.userEmail,
            "❌ Turno no disponible - Reembolso procesado",
            textUser,
            htmlUser
        )
    }

    async sendRaw(to: string, subject: string, text: string, html: string): Promise<void> {
        await this.emailGateway.send(to, subject, text, html)
    }
}
