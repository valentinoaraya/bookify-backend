import { formatDateTime } from "../../shared/utils/datetime"
import { ServiceMapper } from "../service/service.mapper"

function maskEmail(email?: string): string {
    if (!email || !email.includes("@")) return ""
    const [local, domain] = email.split("@")
    const visible = local.slice(0, 1)
    return `${visible}${"*".repeat(Math.max(local.length - 1, 1))}@${domain}`
}

export class AppointmentMapper {
    static formatServiceNested(service: Record<string, any> | null | undefined) {
        if (!service) return service
        // Ya viene con slots / legacy derivado (ServiceMapper.withSlots)
        if (Array.isArray(service.slots)) return service
        return ServiceMapper.withFormattedDates(service)
    }

    static toConfirmResponse(
        appointment: Record<string, any>,
        serviceToSend: Record<string, any> | null,
        serviceId?: string
    ): Record<string, any> {
        const service = this.formatServiceNested(serviceToSend)
        const resolvedServiceId =
            serviceId ||
            (service?._id ? String(service._id) : undefined) ||
            (appointment.serviceId?._id
                ? String(appointment.serviceId._id)
                : String(appointment.serviceId ?? ""))

        return {
            ...appointment,
            serviceId: resolvedServiceId,
            service,
            date: formatDateTime(appointment.date),
        }
    }

    /**
     * DTO de la pantalla de cancelación. Es un endpoint público, así que nunca
     * incluye DNI, teléfono ni datos de pago. El email va enmascarado cuando el
     * link no está firmado, porque en ese caso se pide como prueba de identidad.
     */
    static toDetailResponse(
        appointment: Record<string, any>,
        service: {
            title: string
            duration: number
            price?: number
            signPrice: number
        },
        company: {
            name: string
            city?: string
            street?: string
            number?: string
            phone: string
            email: string
        },
        verified = false
    ) {
        return {
            _id: appointment._id,
            name: appointment.name,
            lastName: appointment.lastName,
            date: formatDateTime(appointment.date),
            mode: appointment.mode,
            status: appointment.status,
            totalPaidAmount: appointment.totalPaidAmount,
            requiresEmailConfirmation: !verified,
            emailHint: maskEmail(appointment.email),
            service: {
                title: service.title,
                duration: service.duration,
                price: service.price,
                signPrice: service.signPrice,
            },
            company: {
                name: company.name,
                city: company.city,
                street: company.street,
                number: company.number,
                phone: company.phone,
                email: company.email,
            },
        }
    }

    static toDeleteResponse(
        appointment: Record<string, any>,
        serviceToSend: Record<string, any> | null | undefined,
        dateInString: string
    ) {
        const service = this.formatServiceNested(serviceToSend)
        return {
            serviceId: service?._id ? String(service._id) : String(appointment.serviceId),
            appointment: { ...appointment, date: dateInString },
            service,
        }
    }

    static toHistoryItem(appointment: any) {
        const formattedDate = formatDateTime(appointment.date)
        return {
            _id: appointment._id,
            name: appointment.name,
            lastName: appointment.lastName,
            email: appointment.email,
            serviceInfo: appointment.serviceInfo,
            phone: appointment.phone,
            dni: appointment.dni,
            mode: appointment.mode,
            userLocation: appointment.userLocation,
            duration: appointment.duration,
            serviceId: {
                _id: appointment.serviceId?._id,
                title: appointment.serviceId?.title,
                duration: appointment.serviceId?.duration,
                price: appointment.serviceId?.price,
            },
            companyId: {
                _id: appointment.companyId._id,
                name: appointment.companyId.name,
            },
            date: appointment.date,
            formattedDate,
            totalPaidAmount: appointment.totalPaidAmount,
            status: appointment.status,
            price: appointment.price || 0,
            cancelledBy: appointment.cancelledBy,
        }
    }

    static toPendingHistoryItem(appointment: any) {
        if (!appointment.serviceId) return null

        const formattedDate = formatDateTime(appointment.date)
        return {
            _id: appointment._id,
            name: appointment.name,
            lastName: appointment.lastName,
            email: appointment.email,
            phone: appointment.phone,
            dni: appointment.dni,
            mode: appointment.mode,
            serviceId: {
                _id: appointment.serviceId._id,
                title: appointment.serviceId.title,
                duration: appointment.serviceId.duration,
                price: appointment.serviceId.price,
            },
            companyId: {
                _id: appointment.companyId._id,
                name: appointment.companyId.name,
            },
            date: appointment.date,
            formattedDate,
            totalPaidAmount: appointment.totalPaidAmount,
            status: appointment.status,
            price: appointment.price || 0,
            cancelledBy: appointment.cancelledBy,
        }
    }

    static formatServiceForSocket(service: Record<string, any> | null | undefined) {
        return this.formatServiceNested(service)
    }
}
