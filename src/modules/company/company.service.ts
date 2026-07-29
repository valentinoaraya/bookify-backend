import { Types } from "mongoose"
import { Email } from "../../types"
import {
    NotFoundError,
    ValidationError,
} from "../../shared/errors"
import { MercadoPagoSubscriptionGateway } from "../../infrastructure/mercadopago/subscription.gateway"
import { AuthService } from "../auth/auth.service"
import { AppointmentRepository } from "../appointment/appointment.repository"
import { PendingReservationRepository } from "../pending-reservation/pending-reservation.repository"
import { ServiceMapper } from "../service/service.mapper"
import { SlotRepository } from "../slot/slot.repository"
import { SubscriptionRepository } from "../subscription/subscription.repository"
import { formatDateTime } from "../../shared/utils/datetime"
import { CompanyRepository } from "./company.repository"
import { CompanyMapper } from "./company.mapper"
import {
    RegisterCompanyInput,
    UpdateCompanyInput,
} from "./company.types"

export class CompanyService {
    constructor(
        private readonly companyRepository: CompanyRepository,
        private readonly authService: AuthService,
        private readonly mpSubscriptionGateway: MercadoPagoSubscriptionGateway,
        private readonly subscriptionRepository: SubscriptionRepository,
        private readonly appointmentRepository: AppointmentRepository,
        private readonly slotRepository: SlotRepository,
        private readonly pendingReservationRepository: PendingReservationRepository
    ) {}

    async register(input: RegisterCompanyInput) {
        if (!input.payer_email) {
            throw new ValidationError("Falta el correo del pagador")
        }

        const email = this.authService.parseEmail(input.email)
        this.authService.assertPasswordFormat(input.password)

        const existing = await this.companyRepository.findByEmail(email)
        if (existing) {
            throw new ValidationError("Ya existe una empresa con este email.")
        }

        const hashedPassword = await this.authService.hashPassword(input.password)

        let newCompany = null as Awaited<ReturnType<CompanyRepository["create"]>> | null
        let subscriptionId: Types.ObjectId | null = null
        let mpPreapprovalId: string | null = null

        try {
            newCompany = await this.createCompanyWithUniqueId({
                name: input.name.trim(),
                email,
                password: hashedPassword,
                phone: input.phone.trim(),
                province: input.province.trim(),
                city: input.city.trim(),
                street: input.street.trim(),
                number: String(input.number).trim(),
                payer_email: input.payer_email.trim().toLowerCase(),
            })

            const mpSubscription = await this.mpSubscriptionGateway.createPreApproval({
                companyId: newCompany.id,
                plan: input.plan,
                payerEmail: input.payer_email,
            })

            if (!mpSubscription.id || !mpSubscription.init_point) {
                if (mpSubscription.id) {
                    mpPreapprovalId = mpSubscription.id
                }
                throw new ValidationError(
                    "Mercado Pago no devolvió un checkout válido. Intentá de nuevo."
                )
            }

            mpPreapprovalId = mpSubscription.id

            const subscription = await this.subscriptionRepository.createForCompany({
                companyId: newCompany._id,
                mpPreapprovalId: mpSubscription.id,
                plan: input.plan,
                status: "pending",
                startDate: new Date(),
                nextPaymentDate: mpSubscription.next_payment_date,
            })
            subscriptionId = subscription._id

            const tokens = this.authService.createTokens({
                id: newCompany._id,
                name: newCompany.name,
                email: newCompany.email as Email,
            })

            newCompany.refresh_token = tokens.refresh_token
            newCompany.subscriptionId = subscription._id
            await newCompany.save()

            return CompanyMapper.toRegisterResponse({
                init_point: mpSubscription.init_point,
                id: newCompany.id,
                name: newCompany.name,
                email: newCompany.email,
                access_token: tokens.access_token,
                refresh_token: tokens.refresh_token,
            })
        } catch (error) {
            if (mpPreapprovalId) {
                await this.mpSubscriptionGateway.cancelPreApproval(mpPreapprovalId)
            }
            if (subscriptionId) {
                await this.subscriptionRepository.deleteById(subscriptionId)
            }
            if (newCompany?._id) {
                await this.companyRepository.deleteById(newCompany._id)
            }
            throw error
        }
    }

    private generateCompanyId(): string {
        return Math.random().toString(36).slice(2, 11)
    }

    private async createCompanyWithUniqueId(data: {
        name: string
        email: string
        password: string
        phone: string
        province: string
        city: string
        street: string
        number: string
        payer_email: string
    }) {
        const maxAttempts = 5
        let lastError: unknown

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            try {
                return await this.companyRepository.create({
                    ...data,
                    company_id: this.generateCompanyId(),
                })
            } catch (error) {
                lastError = error
                const isDuplicateCompanyId =
                    typeof error === "object" &&
                    error !== null &&
                    "code" in error &&
                    (error as { code?: number }).code === 11000 &&
                    "keyPattern" in error &&
                    Boolean(
                        (error as { keyPattern?: Record<string, unknown> }).keyPattern
                            ?.company_id
                    )

                if (!isDuplicateCompanyId) {
                    throw error
                }
            }
        }

        throw lastError instanceof Error
            ? lastError
            : new ValidationError(
                  "No se pudo generar un identificador único. Intentá de nuevo."
              )
    }

    async getPanel(companyId: Types.ObjectId | string) {
        const companyDB = await this.companyRepository.findPanelById(companyId)
        if (!companyDB) {
            throw new NotFoundError("No se encontró la empresa")
        }

        const servicesRaw = (companyDB.services || []) as any[]
        const serviceIds = servicesRaw.map((s) => s._id)

        const [scheduledAppointments, slots, pendings] = await Promise.all([
            this.appointmentRepository.findScheduledByCompany(companyId),
            this.slotRepository.findAllByServiceIds(serviceIds),
            this.pendingReservationRepository.findActiveByServiceIds(serviceIds),
        ])

        const slotsByService = new Map<string, any[]>()
        for (const slot of slots) {
            const key = String(slot.serviceId)
            const list = slotsByService.get(key) || []
            list.push(slot)
            slotsByService.set(key, list)
        }

        const slotById = new Map(slots.map((s) => [s._id.toString(), s]))
        const pendingsByService = new Map<string, any[]>()
        for (const pending of pendings as any[]) {
            const key = String(pending.serviceId)
            const slot = slotById.get(String(pending.slotId))
            const list = pendingsByService.get(key) || []
            list.push({
                _id: pending._id,
                datetime: slot?.datetime ?? new Date(),
                expiresAt: pending.expiresAt,
                userId: pending.userKey,
            })
            pendingsByService.set(key, list)
        }

        const services = servicesRaw.map((service) =>
            ServiceMapper.withSlots(
                service,
                slotsByService.get(String(service._id)) || [],
                (pendingsByService.get(String(service._id)) || []).map((pending) => ({
                    ...pending,
                    datetime:
                        typeof pending.datetime === "string"
                            ? pending.datetime
                            : formatDateTime(pending.datetime),
                }))
            )
        )

        return CompanyMapper.toPanelResponse(companyDB, {
            scheduledAppointments,
            services,
        })
    }

    async update(companyId: Types.ObjectId | string, data: UpdateCompanyInput) {
        const cleanedData: Record<string, unknown> = {}

        if (data.name !== undefined) cleanedData.name = String(data.name).trim()
        if (data.phone !== undefined) cleanedData.phone = String(data.phone).trim()
        if (data.email !== undefined) cleanedData.email = String(data.email).trim()
        if (data.province !== undefined) cleanedData.province = String(data.province).trim()
        if (data.city !== undefined) cleanedData.city = String(data.city).trim()
        if (data.street !== undefined) cleanedData.street = String(data.street).trim()
        if (data.number !== undefined) cleanedData.number = data.number
        if (data.company_id !== undefined) cleanedData.company_id = String(data.company_id).trim()
        if (data.reminders !== undefined) cleanedData.reminders = data.reminders
        if (typeof data.cancellationAnticipationHours === "number") {
            cleanedData.cancellationAnticipationHours = data.cancellationAnticipationHours
        }
        if (typeof data.bookingAnticipationHours === "number") {
            cleanedData.bookingAnticipationHours = data.bookingAnticipationHours
        }
        if (typeof data.slotsVisibilityDays === "number") {
            cleanedData.slotsVisibilityDays = data.slotsVisibilityDays
        }

        if (cleanedData.company_id) {
            const inUse = await this.companyRepository.findCompanyIdInUse(
                cleanedData.company_id as string,
                companyId
            )
            if (inUse) {
                throw new ValidationError("El company_id ya está en uso por otra empresa.")
            }
        }

        const updatedCompany = await this.companyRepository.updateCompanyFields(companyId, {
            $set: cleanedData,
        })

        if (!updatedCompany) {
            throw new NotFoundError("No se encontró la empresa")
        }

        return CompanyMapper.toUpdateResponse(updatedCompany)
    }

    async getPublicBySlug(companyIdSlug: string) {
        const company = await this.companyRepository.findByCompanyId(companyIdSlug)
        if (!company) {
            throw new NotFoundError("Empresa no encontrada.")
        }

        const servicesRaw = (company.services || []) as any[]
        const serviceIds = servicesRaw.map((s) => s._id)
        const slots = await this.slotRepository.findAllByServiceIds(serviceIds)

        const slotsByService = new Map<string, any[]>()
        for (const slot of slots) {
            const key = String(slot.serviceId)
            const list = slotsByService.get(key) || []
            list.push(slot)
            slotsByService.set(key, list)
        }

        const services = servicesRaw.map((service) =>
            ServiceMapper.withSlots(service, slotsByService.get(String(service._id)) || [])
        )

        return {
            ...company,
            services,
        }
    }
}
