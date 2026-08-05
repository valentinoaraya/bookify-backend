import { formatDateTime } from "../../shared/utils/datetime"
import { ServiceMapper } from "../service/service.mapper"
import { SubscriptionRepository } from "../subscription/subscription.repository"

const sortReminders = (reminders: any[] | undefined) =>
    reminders
        ?.slice()
        .sort((a: any, b: any) => {
            if (typeof a.hoursBefore === "number" && typeof b.hoursBefore === "number") {
                return a.hoursBefore - b.hoursBefore
            }
            return 0
        })

const mapSubscription = (companyDB: any) => {
    const populated = companyDB.subscriptionId
    if (populated && typeof populated === "object" && populated.plan) {
        return SubscriptionRepository.toApiShape(populated)
    }
    return null
}

export class CompanyMapper {
    /** Respuesta de GET /companies/get-company */
    static toPanelResponse(
        companyDB: any,
        options: {
            scheduledAppointments?: any[]
            services?: any[]
        } = {}
    ) {
        const services =
            options.services ??
            (companyDB.services || []).map((service: any) =>
                ServiceMapper.withSlots(service, [])
            )

        const scheduledAppointments = (options.scheduledAppointments || []).map(
            (app: any) => ({
                ...app,
                date: formatDateTime(app.date),
            })
        )

        return {
            type: "company",
            _id: companyDB._id,
            name: companyDB.name,
            phone: companyDB.phone,
            email: companyDB.email,
            payer_email: companyDB.payer_email || "",
            province: companyDB.province,
            city: companyDB.city,
            street: companyDB.street,
            number: companyDB.number,
            scheduledAppointments,
            reminders: sortReminders(companyDB.reminders),
            services,
            connectedWithMP: companyDB.connectedWithMP,
            company_id: companyDB.company_id,
            cancellationAnticipationHours: companyDB.cancellationAnticipationHours,
            bookingAnticipationHours: companyDB.bookingAnticipationHours,
            slotsVisibilityDays: companyDB.slotsVisibilityDays,
            subscription: mapSubscription(companyDB),
        }
    }

    /** Respuesta de PUT /companies/update-company */
    static toUpdateResponse(updatedCompany: any) {
        return {
            type: "company",
            name: updatedCompany.name,
            company_id: updatedCompany.company_id,
            email: updatedCompany.email,
            phone: updatedCompany.phone,
            city: updatedCompany.city,
            street: updatedCompany.street,
            number: updatedCompany.number,
            reminders: sortReminders(updatedCompany.reminders),
            slotsVisibilityDays: updatedCompany.slotsVisibilityDays,
            cancellationAnticipationHours: updatedCompany.cancellationAnticipationHours,
            bookingAnticipationHours: updatedCompany.bookingAnticipationHours,
        }
    }

    /** Respuesta de login (sin password). */
    static toLoginResponse(result: {
        id: any
        name: string
        email: string
        access_token: string
        refresh_token: string
    }) {
        return {
            id: result.id,
            name: result.name,
            email: result.email,
            access_token: result.access_token,
            refresh_token: result.refresh_token,
        }
    }

    /** Respuesta de registro (+ init_point MP si el plan es de pago). */
    static toRegisterResponse(data: {
        init_point?: string
        id: string
        name: string
        email: string
        access_token: string
        refresh_token: string
        requiresPayment?: boolean
    }) {
        return data
    }
}
