import moment from "moment-timezone"
import { Types } from "mongoose"
import {
    ForbiddenError,
    NotFoundError,
    ValidationError,
} from "../../shared/errors"
import { parseBaTz, BA_TIMEZONE } from "../../shared/utils/datetime"
import { PLAN_RULES, planAllowsIntegrations } from "../../utils/planRules"
import { CompanyRepository } from "../company/company.repository"
import { SlotMapper } from "../slot/slot.mapper"
import { SlotRepository } from "../slot/slot.repository"
import { SubscriptionRepository } from "../subscription/subscription.repository"
import { PendingReservationRepository } from "../pending-reservation/pending-reservation.repository"
import { generateAppointments } from "./generate-slots"
import { ServiceMapper } from "./service.mapper"
import { ServiceRepository } from "./service.repository"
import {
    CreateServiceInput,
    EnableSlotsInput,
    UpdateServiceInput,
} from "./service.types"

export interface AppointmentCleanupPort {
    deleteByCompany(
        appointmentId: string,
        companyId: string,
        companyName: string,
        companyEmail: string
    ): Promise<unknown>
    snapshotServiceInfo(serviceId: string, title: string): Promise<void>
    findScheduledIdsByService(
        serviceId: string
    ): Promise<Array<{ id: string; _id: Types.ObjectId }>>
}

export class ServiceService {
    private appointmentCleanup?: AppointmentCleanupPort

    constructor(
        private readonly serviceRepository: ServiceRepository,
        private readonly companyRepository: CompanyRepository,
        private readonly slotRepository: SlotRepository,
        private readonly subscriptionRepository: SubscriptionRepository,
        private readonly pendingReservationRepository: PendingReservationRepository
    ) {}

    setAppointmentCleanup(port: AppointmentCleanupPort): void {
        this.appointmentCleanup = port
    }

    async create(companyId: Types.ObjectId | string, input: CreateServiceInput) {
        const companyDb = await this.companyRepository.findById(companyId)
        if (!companyDb) throw new NotFoundError("Empresa no encontrada.")

        const subscription = await this.subscriptionRepository.findByCompanyId(companyId)
        const plan = subscription?.plan || "individual"
        const maxServices = PLAN_RULES[plan]?.max_services ?? 3
        const existingServices = await this.serviceRepository.findByCompany(companyId)
        const activeCount = existingServices.filter((s) => s.active).length
        if (activeCount >= maxServices) {
            throw new ForbiddenError(
                "Has alcanzado el límite de servicios para tu plan. Actualiza tu plan para agregar más servicios."
            )
        }

        const allowsIntegrations = planAllowsIntegrations(plan)
        const signPrice =
            allowsIntegrations && companyDb.connectedWithMP
                ? input.signPrice
                : 0

        const capacityPerShift = input.capacityPerShift <= 0 ? 1 : input.capacityPerShift
        const savedService = await this.serviceRepository.create({
            companyId: companyId as Types.ObjectId,
            title: input.title.trim(),
            description: input.description.trim(),
            price: input.price,
            capacityPerShift,
            duration: input.duration,
            signPrice,
            mode: input.mode || "online",
            active: true,
        })

        await this.companyRepository.updateById(companyId, {
            $push: { services: savedService._id },
        })

        return savedService
    }

    async getById(id: string) {
        const service = await this.serviceRepository.findLeanById(id)
        if (!service) throw new NotFoundError("Servicio no encontrado.")

        const [slots, pendings] = await Promise.all([
            this.slotRepository.findAllByService(id),
            this.pendingReservationRepository.findActiveByService(id),
        ])

        // Endpoint público: se informa que el horario está retenido, pero nunca
        // quién lo retiene.
        const slotById = new Map(slots.map((slot) => [slot._id.toString(), slot]))
        const pendingAppointments = pendings
            .map((pending) => {
                const slot = slotById.get(pending.slotId.toString())
                if (!slot) return null
                return {
                    datetime: slot.datetime,
                    expiresAt: pending.holdUntil ?? pending.expiresAt,
                }
            })
            .filter((pending): pending is NonNullable<typeof pending> => pending !== null)

        return ServiceMapper.withSlots(service, slots, pendingAppointments)
    }

    async containsSignPrice(id: string) {
        const service = await this.serviceRepository.findLeanById(id)
        if (!service) throw new NotFoundError("Servicio no encontrado.")
        return { contains: service.signPrice > 0 }
    }

    async update(id: string, body: UpdateServiceInput) {
        const serviceBeforeUpdate = await this.serviceRepository.findLeanById(id)
        if (!serviceBeforeUpdate) throw new NotFoundError("Servicio no encontrado")

        const fieldsToUpdate: Record<string, unknown> = {}
        if (body.title != undefined) fieldsToUpdate.title = body.title.trim()
        if (body.description != undefined) fieldsToUpdate.description = body.description.trim()
        if (body.price != undefined) fieldsToUpdate.price = body.price
        if (body.capacityPerShift != undefined && body.capacityPerShift > 0) {
            fieldsToUpdate.capacityPerShift = body.capacityPerShift
        }
        if (body.duration != undefined) fieldsToUpdate.duration = body.duration
        if (body.signPrice != undefined) {
            const subscription =
                await this.subscriptionRepository.findByCompanyId(
                    serviceBeforeUpdate.companyId
                )
            const plan = subscription?.plan || "individual"
            const company = await this.companyRepository.findById(
                serviceBeforeUpdate.companyId
            )
            fieldsToUpdate.signPrice =
                planAllowsIntegrations(plan) && company?.connectedWithMP
                    ? body.signPrice
                    : 0
        }
        if (
            body.mode != undefined &&
            (body.mode === "in-person" ||
                body.mode === "online" ||
                body.mode === "in-person-at-home")
        ) {
            fieldsToUpdate.mode = body.mode
        }

        if (
            fieldsToUpdate.capacityPerShift != undefined &&
            serviceBeforeUpdate.capacityPerShift !== fieldsToUpdate.capacityPerShift
        ) {
            const newCapacity = fieldsToUpdate.capacityPerShift as number
            const slots = await this.slotRepository.findAllByService(id)

            if (serviceBeforeUpdate.capacityPerShift < newCapacity) {
                await this.slotRepository.setCapacityForService(id, newCapacity)
            } else {
                for (const slot of slots) {
                    if (slot.taken >= newCapacity) {
                        await this.slotRepository.adjustCapacity(slot._id, slot.taken)
                    } else {
                        await this.slotRepository.adjustCapacity(slot._id, newCapacity)
                    }
                }
            }
        }

        const service = await this.serviceRepository.setFields(id, { $set: fieldsToUpdate })
        if (!service) throw new NotFoundError("Servicio no encontrado")
        const slots = await this.slotRepository.findAllByService(id)
        return ServiceMapper.withSlots(service, slots)
    }

    async delete(
        id: string,
        company: { id: Types.ObjectId | string; name: string; email: string }
    ) {
        if (!this.appointmentCleanup) {
            throw new Error("AppointmentCleanupPort no configurado en ServiceService")
        }

        const appointmentsToDelete =
            await this.appointmentCleanup.findScheduledIdsByService(id)

        for (const appointment of appointmentsToDelete) {
            await this.appointmentCleanup.deleteByCompany(
                appointment.id,
                String(company.id),
                company.name,
                company.email
            )
        }

        const service = await this.serviceRepository.findLeanById(id)
        if (!service) throw new NotFoundError("Servicio no encontrado.")

        await this.appointmentCleanup.snapshotServiceInfo(id, service.title)
        await this.slotRepository.deleteByService(id)

        const serviceToSend = await this.serviceRepository.deleteById(id)
        if (!serviceToSend) throw new NotFoundError("Servicio no encontrado.")

        await this.companyRepository.updateById(serviceToSend.companyId, {
            $pull: { services: id },
        })

        return {
            data: "Servicio eliminado",
            serviceId: id,
            appointmentsToDelete: appointmentsToDelete.map((app) => app._id),
        }
    }

    async enableSlots(id: string, input: EnableSlotsInput) {
        const service = await this.serviceRepository.findById(id)
        if (!service) throw new NotFoundError("Servicio no encontrado")

        const arrayAppointmentsInString = generateAppointments({
            hourStart: input.hourStart,
            hourFinish: input.hourFinish,
            turnEach: input.turnEach,
            days: input.days,
            capacityPerShift: service.capacityPerShift,
        })

        const slots = arrayAppointmentsInString.map((appointment) => ({
            serviceId: service._id,
            companyId: service.companyId,
            datetime: moment
                .tz(appointment.datetime, "YYYY-MM-DD HH:mm", BA_TIMEZONE)
                .toDate(),
            capacity: service.capacityPerShift,
            taken: 0,
        }))

        await this.slotRepository.upsertMany(slots)
        return arrayAppointmentsInString
    }

    async addEnableAppointment(id: string, date: string) {
        const newDate = parseBaTz(date)
        const service = await this.serviceRepository.findLeanById(id)
        if (!service) throw new NotFoundError("Servicio no encontrado.")

        const slot = await this.slotRepository.incrementCapacity(
            id,
            newDate,
            service.companyId,
            1
        )
        if (!slot) throw new ValidationError("Servicio no acutalizado.")

        const slots = await this.slotRepository.findAllByService(id)
        return {
            service: ServiceMapper.withSlots(service, slots),
            appointment: SlotMapper.toAvailableShape(slot),
        }
    }

    async deleteEnabledAppointment(id: string, date: string, all?: boolean) {
        const newDate = parseBaTz(date)
        const service = await this.serviceRepository.findLeanById(id)
        if (!service) throw new NotFoundError("Servicio no encontrado.")

        const before = await this.slotRepository.findByServiceAndDatetime(id, newDate)
        if (!before) throw new NotFoundError("Turno no encontrado")

        const updated = await this.slotRepository.decrementCapacityOrDelete(
            id,
            newDate,
            !!all
        )
        const slots = await this.slotRepository.findAllByService(id)

        return {
            service: ServiceMapper.withSlots(service, slots),
            appointment: {
                datetime: date,
                capacity: updated?.capacity ?? 0,
                taken: updated?.taken ?? before.taken,
            },
        }
    }

    async assertCompanyOwnsService(
        companyId: Types.ObjectId | string,
        serviceId: string
    ): Promise<void> {
        const company = await this.companyRepository.findById(companyId)
        if (!company) throw new ValidationError("Empresa no encontrada")

        const arrayServices = company.services.map((idService) => idService.toString())
        if (!arrayServices.includes(serviceId)) {
            throw new NotFoundError("La empresa no contiene este servicio.")
        }
    }
}
