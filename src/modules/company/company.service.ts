import { Types } from "mongoose"
import { Email } from "../../types"
import {
    ForbiddenError,
    NotFoundError,
    ValidationError,
} from "../../shared/errors"
import { MercadoPagoSubscriptionGateway } from "../../infrastructure/mercadopago/subscription.gateway"
import { AuthService } from "../auth/auth.service"
import { AppointmentRepository } from "../appointment/appointment.repository"
import { PendingReservationRepository } from "../pending-reservation/pending-reservation.repository"
import { ServiceMapper } from "../service/service.mapper"
import { ServiceRepository } from "../service/service.repository"
import { SlotRepository } from "../slot/slot.repository"
import { SubscriptionRepository } from "../subscription/subscription.repository"
import { formatDateTime } from "../../shared/utils/datetime"
import { PLAN_RULES, isPaidPlan } from "../../utils/planRules"
import { CompanyRepository } from "./company.repository"
import { CompanyMapper } from "./company.mapper"
import {
    CompanyLocation,
    CreateLocationInput,
    RegisterCompanyInput,
    UpdateCompanyInput,
    UpdateLocationInput,
} from "./company.types"
import {
    buildLocationsFromLegacy,
    syncLegacyAddressFromDefault,
} from "./location.utils"

export class CompanyService {
    constructor(
        private readonly companyRepository: CompanyRepository,
        private readonly authService: AuthService,
        private readonly mpSubscriptionGateway: MercadoPagoSubscriptionGateway,
        private readonly subscriptionRepository: SubscriptionRepository,
        private readonly appointmentRepository: AppointmentRepository,
        private readonly slotRepository: SlotRepository,
        private readonly pendingReservationRepository: PendingReservationRepository,
        private readonly serviceRepository?: ServiceRepository
    ) {}

    async register(input: RegisterCompanyInput) {
        const paid = isPaidPlan(input.plan)
        if (paid && !input.payer_email?.trim()) {
            throw new ValidationError("Falta el correo del pagador")
        }

        const email = this.authService.parseEmail(input.email)
        this.authService.assertPasswordFormat(input.password)

        const existing = await this.companyRepository.findByEmail(email)
        if (existing) {
            throw new ValidationError("Ya existe una empresa con este email.")
        }

        const hashedPassword = await this.authService.hashPassword(input.password)
        const payerEmail = input.payer_email?.trim().toLowerCase() || undefined

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
                payer_email: payerEmail,
            })

            if (!paid) {
                const subscription =
                    await this.subscriptionRepository.createForCompany({
                        companyId: newCompany._id,
                        plan: input.plan,
                        status: "active",
                        startDate: new Date(),
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
                    id: newCompany.id,
                    name: newCompany.name,
                    email: newCompany.email,
                    access_token: tokens.access_token,
                    refresh_token: tokens.refresh_token,
                    requiresPayment: false,
                })
            }

            const mpSubscription =
                await this.mpSubscriptionGateway.createPreApproval({
                    companyId: newCompany.id,
                    plan: input.plan,
                    payerEmail: payerEmail!,
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
                requiresPayment: true,
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
        payer_email?: string
    }) {
        const maxAttempts = 5
        let lastError: unknown

        const primaryLocation: CompanyLocation = {
            _id: new Types.ObjectId(),
            name: "Sede principal",
            province: data.province,
            city: data.city,
            street: data.street,
            number: data.number,
            isDefault: true,
        }

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            try {
                return await this.companyRepository.create({
                    ...data,
                    locations: [primaryLocation],
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

    /** Migra dirección legacy → locations[] si hace falta y sincroniza campos flat. */
    async ensureLocations(companyId: Types.ObjectId | string): Promise<CompanyLocation[]> {
        const company = await this.companyRepository.findById(companyId)
        if (!company) throw new NotFoundError("No se encontró la empresa")

        const fromLegacy = buildLocationsFromLegacy(company)
        if (fromLegacy) {
            const legacySync = syncLegacyAddressFromDefault(fromLegacy)
            await this.companyRepository.updateById(companyId, {
                $set: {
                    locations: fromLegacy,
                    ...(legacySync ?? {}),
                    updatedAt: new Date(),
                },
            })
            return fromLegacy
        }

        return company.locations || []
    }

    private async getPlanMaxLocations(companyId: Types.ObjectId | string): Promise<number> {
        const subscription = await this.subscriptionRepository.findByCompanyId(companyId)
        const plan = subscription?.plan || "individual"
        return PLAN_RULES[plan]?.max_locations ?? 1
    }

    async getPanel(companyId: Types.ObjectId | string) {
        await this.ensureLocations(companyId)

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

        const touchesAddress =
            data.city !== undefined ||
            data.street !== undefined ||
            data.number !== undefined ||
            data.province !== undefined

        if (touchesAddress) {
            await this.ensureLocations(companyId)
            const company = await this.companyRepository.findById(companyId)
            if (company?.locations?.length) {
                const locations = company.locations.map((loc) => {
                    if (!loc.isDefault) return loc
                    return {
                        ...loc,
                        province:
                            data.province !== undefined
                                ? String(data.province).trim()
                                : loc.province,
                        city:
                            data.city !== undefined
                                ? String(data.city).trim()
                                : loc.city,
                        street:
                            data.street !== undefined
                                ? String(data.street).trim()
                                : loc.street,
                        number:
                            data.number !== undefined
                                ? String(data.number).trim()
                                : loc.number,
                    }
                })
                cleanedData.locations = locations
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

    async addLocation(companyId: Types.ObjectId | string, input: CreateLocationInput) {
        await this.ensureLocations(companyId)
        const company = await this.companyRepository.findById(companyId)
        if (!company) throw new NotFoundError("No se encontró la empresa")

        const maxLocations = await this.getPlanMaxLocations(companyId)
        const current = company.locations || []
        if (current.length >= maxLocations) {
            throw new ForbiddenError(
                `Has alcanzado el límite de sedes para tu plan (${maxLocations}). Actualizá tu plan para agregar más.`
            )
        }

        const makeDefault = input.isDefault === true || current.length === 0
        const locations: CompanyLocation[] = makeDefault
            ? current.map((l) => ({ ...l, isDefault: false }))
            : [...current]

        const newLocation: CompanyLocation = {
            _id: new Types.ObjectId(),
            name: input.name.trim(),
            province: input.province?.trim() || undefined,
            city: input.city.trim(),
            street: input.street.trim(),
            number: String(input.number).trim(),
            isDefault: makeDefault,
        }
        locations.push(newLocation)

        const legacy = syncLegacyAddressFromDefault(locations)
        const updated = await this.companyRepository.updateCompanyFields(companyId, {
            $set: {
                locations,
                ...(legacy ?? {}),
                updatedAt: new Date(),
            },
        })
        if (!updated) throw new NotFoundError("No se encontró la empresa")
        return CompanyMapper.toPanelResponse(updated)
    }

    async updateLocation(
        companyId: Types.ObjectId | string,
        locationId: string,
        input: UpdateLocationInput
    ) {
        await this.ensureLocations(companyId)
        const company = await this.companyRepository.findById(companyId)
        if (!company) throw new NotFoundError("No se encontró la empresa")

        const locations = [...(company.locations || [])]
        const index = locations.findIndex((l) => String(l._id) === String(locationId))
        if (index < 0) throw new NotFoundError("Sede no encontrada")

        const current = locations[index]
        locations[index] = {
            ...current,
            name: input.name !== undefined ? input.name.trim() : current.name,
            province:
                input.province !== undefined
                    ? input.province.trim() || undefined
                    : current.province,
            city: input.city !== undefined ? input.city.trim() : current.city,
            street: input.street !== undefined ? input.street.trim() : current.street,
            number:
                input.number !== undefined
                    ? String(input.number).trim()
                    : current.number,
        }

        const legacy = syncLegacyAddressFromDefault(locations)
        const updated = await this.companyRepository.updateCompanyFields(companyId, {
            $set: {
                locations,
                ...(legacy ?? {}),
                updatedAt: new Date(),
            },
        })
        if (!updated) throw new NotFoundError("No se encontró la empresa")
        return CompanyMapper.toPanelResponse(updated)
    }

    async deleteLocation(companyId: Types.ObjectId | string, locationId: string) {
        await this.ensureLocations(companyId)
        const company = await this.companyRepository.findById(companyId)
        if (!company) throw new NotFoundError("No se encontró la empresa")

        const locations = [...(company.locations || [])]
        if (locations.length <= 1) {
            throw new ValidationError("Debés conservar al menos una sede.")
        }

        const index = locations.findIndex((l) => String(l._id) === String(locationId))
        if (index < 0) throw new NotFoundError("Sede no encontrada")

        const removed = locations[index]
        locations.splice(index, 1)

        if (removed.isDefault && locations.length > 0) {
            locations[0] = { ...locations[0], isDefault: true }
        }

        if (this.serviceRepository) {
            await this.serviceRepository.pullLocationIdFromCompanyServices(
                companyId,
                locationId
            )
        }

        const legacy = syncLegacyAddressFromDefault(locations)
        const updated = await this.companyRepository.updateCompanyFields(companyId, {
            $set: {
                locations,
                ...(legacy ?? {}),
                updatedAt: new Date(),
            },
        })
        if (!updated) throw new NotFoundError("No se encontró la empresa")
        return CompanyMapper.toPanelResponse(updated)
    }

    async setDefaultLocation(companyId: Types.ObjectId | string, locationId: string) {
        await this.ensureLocations(companyId)
        const company = await this.companyRepository.findById(companyId)
        if (!company) throw new NotFoundError("No se encontró la empresa")

        const locations = (company.locations || []).map((l) => ({
            ...l,
            isDefault: String(l._id) === String(locationId),
        }))

        if (!locations.some((l) => l.isDefault)) {
            throw new NotFoundError("Sede no encontrada")
        }

        const legacy = syncLegacyAddressFromDefault(locations)
        const updated = await this.companyRepository.updateCompanyFields(companyId, {
            $set: {
                locations,
                ...(legacy ?? {}),
                updatedAt: new Date(),
            },
        })
        if (!updated) throw new NotFoundError("No se encontró la empresa")
        return CompanyMapper.toPanelResponse(updated)
    }

    async getPublicBySlug(companyIdSlug: string) {
        const company = await this.companyRepository.findByCompanyId(companyIdSlug)
        if (!company) {
            throw new NotFoundError("Empresa no encontrada.")
        }

        await this.ensureLocations(company._id)
        const refreshed = await this.companyRepository.findByCompanyId(companyIdSlug)
        if (!refreshed) {
            throw new NotFoundError("Empresa no encontrada.")
        }

        const servicesRaw = (refreshed.services || []) as any[]
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

        return CompanyMapper.toPublicResponse(refreshed, services)
    }
}
