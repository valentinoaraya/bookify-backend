import { MercadoPagoSubscriptionGateway } from "../../infrastructure/mercadopago/subscription.gateway"
import { PreApproval } from "mercadopago"
import { mercadoPagoAedes } from "../../services/mercadopagoService"
import { namesAndAmounts, PLAN_RULES, FREE_UPGRADE_MARKER, FREE_PLAN, planAllowsIntegrations } from "../../utils/planRules"
import {
    notifyAedesFlow,
    buildCustomerUpsertedPayload,
    buildSubscriptionUpsertedPayload,
    buildSubscriptionCanceledPayload,
    buildPaymentPayload,
} from "../../infrastructure/aedesflow"
import { ForbiddenError, NotFoundError, ValidationError } from "../../shared/errors"
import { logger } from "../../shared/logger"
import { CompanyRepository } from "../company/company.repository"
import { ServiceRepository } from "../service/service.repository"
import { PlanType } from "../company/company.types"
import { NotificationService } from "../notification/notification.service"
import { MpTokenService } from "../payment/mp-token.service"
import { SubscriptionRepository } from "./subscription.repository"
import {
    SubscriptionDocument,
    SubscriptionPlan,
    SubscriptionStatus,
} from "./subscription.types"

const PLAN_ORDER: SubscriptionPlan[] = ["individual", "individual_plus", "team"]
const CHANGEABLE_PLANS: SubscriptionPlan[] = ["individual", "individual_plus"]

/**
 * FSM de suscripción:
 *   pending → active
 *   active → upgrading → active (nuevo plan autorizado) | active (abort)
 *   active → downgrading → active
 *   active → cancelling → inactive
 */
export class SubscriptionService {
    constructor(
        private readonly companyRepository: CompanyRepository,
        private readonly serviceRepository: ServiceRepository,
        private readonly mpSubscriptionGateway: MercadoPagoSubscriptionGateway,
        private readonly subscriptionRepository: SubscriptionRepository,
        private readonly notificationService?: NotificationService
    ) {}

    private assertTransition(
        from: SubscriptionStatus | undefined,
        to: SubscriptionStatus
    ): void {
        const allowed: Record<SubscriptionStatus, SubscriptionStatus[]> = {
            pending: ["active", "inactive"],
            active: ["upgrading", "downgrading", "cancelling", "inactive"],
            upgrading: ["active"],
            downgrading: ["active"],
            cancelling: ["inactive"],
            inactive: ["pending", "active"],
        }
        if (!from) return
        if (!allowed[from]?.includes(to)) {
            throw new ValidationError(
                `Transición de suscripción inválida: ${from} → ${to}`
            )
        }
    }

    private planRank(plan: SubscriptionPlan): number {
        return PLAN_ORDER.indexOf(plan)
    }

    private assertChangeablePlan(plan: string): asserts plan is SubscriptionPlan {
        if (!CHANGEABLE_PLANS.includes(plan as SubscriptionPlan)) {
            throw new ValidationError("Plan no disponible")
        }
    }

    private assertUpgradePlan(current: SubscriptionPlan, next: SubscriptionPlan) {
        this.assertChangeablePlan(next)
        if (this.planRank(next) <= this.planRank(current)) {
            throw new ValidationError(
                "El nuevo plan debe ser superior al plan actual."
            )
        }
    }

    private assertDowngradePlan(current: SubscriptionPlan, next: SubscriptionPlan) {
        this.assertChangeablePlan(next)
        if (this.planRank(next) >= this.planRank(current)) {
            throw new ValidationError(
                "El nuevo plan debe ser inferior al plan actual."
            )
        }
    }

    private assertOwnedPreapproval(
        subscription: SubscriptionDocument | null,
        suscriptionId: string
    ) {
        if (!subscription) {
            throw new NotFoundError("Suscripción no encontrada.")
        }
        if (subscription.mpPreapprovalId !== suscriptionId) {
            throw new ForbiddenError(
                "La suscripción no corresponde a esta empresa."
            )
        }
    }

    private isFreeSubscription(subscription: SubscriptionDocument | null): boolean {
        return Boolean(
            subscription &&
                subscription.plan === FREE_PLAN &&
                !subscription.mpPreapprovalId
        )
    }

	private async disconnectMercadoPago(companyId: string) {
		await this.companyRepository.updateById(companyId, {
			$set: MpTokenService.buildClearFields(),
		})
		await this.serviceRepository.clearSignPricesByCompany(companyId)
	}

    private async applyPlanRestrictions(companyId: string, newPlan: string) {
        const company = await this.companyRepository.findById(companyId)
        if (!company) throw new NotFoundError("Empresa no encontrada.")

        const rules = PLAN_RULES[newPlan]
        const services = await this.serviceRepository.findByCompanySorted(companyId)
        const activeServices = services.filter((s) => s.active)
        if (activeServices.length > rules.max_services) {
            const toDeactivate = activeServices.slice(rules.max_services)
            await this.serviceRepository.deactivateMany(
                toDeactivate.map((s) => s._id)
            )
        }

        if (!planAllowsIntegrations(newPlan)) {
            await this.disconnectMercadoPago(companyId)
        }
    }

    /**
     * Aplica beneficios del plan (reactivar servicios inactivos hasta el cupo).
     * Solo debe llamarse cuando el preapproval queda `authorized` (webhook),
     * nunca al iniciar el upgrade.
     */
    async applyPlanBenefits(companyId: string, newPlan: string) {
        const company = await this.companyRepository.findById(companyId)
        if (!company) throw new NotFoundError("Empresa no encontrada.")

        const rules = PLAN_RULES[newPlan]
        const services = await this.serviceRepository.findByCompanySorted(companyId)
        const activeServices = services.filter((s) => s.active)
        const inactiveServices = services.filter((s) => !s.active)
        const remainingSlots = rules.max_services - activeServices.length

        if (remainingSlots > 0 && inactiveServices.length > 0) {
            const toActivate = inactiveServices.slice(0, remainingSlots)
            await this.serviceRepository.activateMany(toActivate.map((s) => s._id))
        }
    }

    /**
     * Upgrade: crea un preapproval nuevo SIN cancelar el actual.
     * El plan vigente no cambia hasta webhook authorized (`pendingPlan`).
     * Desde plan free (sin PreApproval) usa FREE_UPGRADE_MARKER como previous.
     */
    async upgrade(
        suscriptionId: string,
        input: { newPlan: PlanType; payer_email: string; companyId: string }
    ) {
        const current = await this.subscriptionRepository.findByCompanyId(
            input.companyId
        )
        if (!current) {
            throw new NotFoundError("Suscripción no encontrada.")
        }

        const fromFree = this.isFreeSubscription(current)
        if (fromFree) {
            const allowedIds = ["", "free", "none", FREE_UPGRADE_MARKER]
            if (suscriptionId && !allowedIds.includes(suscriptionId)) {
                throw new ForbiddenError(
                    "La suscripción no corresponde a esta empresa."
                )
            }
        } else {
            this.assertOwnedPreapproval(current, suscriptionId)
        }

        this.assertUpgradePlan(current.plan, input.newPlan)

        const previousId = fromFree
            ? FREE_UPGRADE_MARKER
            : (current.mpPreapprovalId as string)
        const now = new Date()

        await this.subscriptionRepository.beginTransition(
            input.companyId,
            "active",
            "upgrading",
            {
                previousPreapprovalId: previousId,
                pendingPlan: input.newPlan,
                transitionStartedAt: now,
            }
        )

        try {
            const mpSubscription =
                await this.mpSubscriptionGateway.createPreApproval({
                    companyId: input.companyId,
                    plan: input.newPlan,
                    payerEmail: input.payer_email,
                })

            if (!mpSubscription.id || !mpSubscription.init_point) {
                if (mpSubscription.id) {
                    await this.mpSubscriptionGateway.cancelPreApproval(
                        mpSubscription.id
                    )
                }
                throw new ValidationError(
                    "Mercado Pago no devolvió un checkout válido. Intentá de nuevo."
                )
            }

            await this.subscriptionRepository.updateStatus(
                input.companyId,
                "upgrading",
                {
                    mpPreapprovalId: mpSubscription.id,
                    previousPreapprovalId: previousId,
                    pendingPlan: input.newPlan,
                    transitionStartedAt: now,
                }
            )

            const company = await this.companyRepository.findById(input.companyId)
            if (company) {
                await this.companyRepository.updateById(input.companyId, {
                    $set: {
                        payer_email: input.payer_email.trim().toLowerCase(),
                        updatedAt: new Date(),
                    },
                })
            }

            return { init_point: mpSubscription.init_point }
        } catch (error) {
            if (fromFree) {
                await this.subscriptionRepository.clearTransitionFields(
                    input.companyId,
                    {
                        status: "active",
                    }
                )
                await this.subscriptionRepository.unsetMpPreapproval(
                    input.companyId
                )
            } else {
                await this.subscriptionRepository.clearTransitionFields(
                    input.companyId,
                    {
                        status: "active",
                        mpPreapprovalId: previousId,
                    }
                )
            }
            throw error
        }
    }

    async downgrade(
        suscriptionId: string,
        input: { newPlan: PlanType; companyId: string }
    ) {
        const current = await this.subscriptionRepository.findByCompanyId(
            input.companyId
        )
        if (!current) {
            throw new NotFoundError("Suscripción no encontrada.")
        }
        this.assertDowngradePlan(current.plan, input.newPlan)

        const toFree = input.newPlan === FREE_PLAN

        if (toFree) {
            if (current.mpPreapprovalId) {
                this.assertOwnedPreapproval(current, suscriptionId)
            }

            await this.subscriptionRepository.beginTransition(
                input.companyId,
                "active",
                "downgrading",
                { transitionStartedAt: new Date() }
            )

            try {
                if (current.mpPreapprovalId) {
                    await this.mpSubscriptionGateway.cancelPreApproval(
                        current.mpPreapprovalId
                    )
                }

                await this.subscriptionRepository.clearTransitionFields(
                    input.companyId,
                    {
                        status: "active",
                        plan: FREE_PLAN,
                    }
                )
                await this.subscriptionRepository.unsetMpPreapproval(
                    input.companyId
                )
                await this.applyPlanRestrictions(input.companyId, FREE_PLAN)
                await this.pushAedesFlowSubscriptionUpserted(
                    input.companyId,
                    FREE_PLAN
                )
                return "Plan changed succesfully"
            } catch (error) {
                await this.subscriptionRepository.clearTransitionFields(
                    input.companyId,
                    { status: "active" }
                )
                throw error
            }
        }

        this.assertOwnedPreapproval(current, suscriptionId)

        await this.subscriptionRepository.beginTransition(
            input.companyId,
            "active",
            "downgrading",
            { transitionStartedAt: new Date() }
        )

        try {
            const planInfo = namesAndAmounts[input.newPlan]
            const response = await new PreApproval(mercadoPagoAedes).update({
                id: suscriptionId as any,
                body: {
                    reason: `Suscripción Bookify - ${planInfo.name}`,
                    auto_recurring: {
                        transaction_amount: planInfo.price,
                        currency_id: "ARS",
                    },
                },
            })

            if (response.auto_recurring?.transaction_amount !== planInfo.price) {
                throw new ValidationError(
                    "No hemos podido cambiar el monto del plan"
                )
            }

            await this.subscriptionRepository.clearTransitionFields(
                input.companyId,
                {
                    status: "active",
                    plan: input.newPlan,
                }
            )

            await this.applyPlanRestrictions(input.companyId, input.newPlan)
            await this.pushAedesFlowSubscriptionUpserted(
                input.companyId,
                input.newPlan
            )
            return "Plan changed succesfully"
        } catch (error) {
            await this.subscriptionRepository.clearTransitionFields(
                input.companyId,
                { status: "active" }
            )
            throw error
        }
    }

    async cancel(suscriptionId: string, companyId: string) {
        const current =
            await this.subscriptionRepository.findByCompanyId(companyId)
        this.assertOwnedPreapproval(current, suscriptionId)

        const company = await this.companyRepository.findById(companyId)
        if (!company) throw new NotFoundError("Empresa no encontrada.")

        await this.subscriptionRepository.beginTransition(
            companyId,
            "active",
            "cancelling",
            { transitionStartedAt: new Date() }
        )

        let mpCancelled = false
        try {
            const response = await new PreApproval(mercadoPagoAedes).update({
                id: suscriptionId as any,
                body: { status: "cancelled" },
            })

            if (response.status !== "cancelled") {
                throw new Error("Error al cancelar suscripción actual.")
            }
            mpCancelled = true

            await this.subscriptionRepository.clearTransitionFields(companyId, {
                status: "inactive",
            })

            // El mail va acá (no en el webhook): al cancelar desde el panel
            // ya dejamos status=inactive, y el webhook de MP llega tarde y
            // no notificaría (solo notifica si status es active/cancelling).
            await this.notifySubscriptionCancelled(company.email)
            await this.pushAedesFlowSubscriptionCanceled(companyId, current)

            return "Suscription cancelled"
        } catch (error) {
            if (mpCancelled) {
                await this.subscriptionRepository.clearTransitionFields(
                    companyId,
                    { status: "inactive" }
                )
            } else {
                await this.subscriptionRepository.clearTransitionFields(
                    companyId,
                    { status: "active" }
                )
            }
            throw error
        }
    }

    /**
     * Reintenta el checkout de una suscripción pending o inactive.
     */
    async resume(
        companyId: string,
        input: { payer_email?: string } = {}
    ): Promise<{ init_point: string }> {
        const company = await this.companyRepository.findById(companyId)
        if (!company) throw new NotFoundError("Empresa no encontrada.")

        const subscription =
            await this.subscriptionRepository.findByCompanyId(companyId)
        if (!subscription) {
            throw new NotFoundError("Suscripción no encontrada.")
        }

        const status = subscription.status
        if (status !== "pending" && status !== "inactive") {
            throw new ValidationError(
                "Solo podés reintentar el pago si la suscripción está pendiente o inactiva."
            )
        }

        const payerEmail = (
            input.payer_email?.trim() ||
            company.payer_email ||
            ""
        ).toLowerCase()

        if (!payerEmail) {
            throw new ValidationError(
                "Falta el correo del pagador. Completalo e intentá de nuevo."
            )
        }

        if (subscription.mpPreapprovalId) {
            await this.mpSubscriptionGateway.cancelPreApproval(
                subscription.mpPreapprovalId
            )
        }

        const mpSubscription = await this.mpSubscriptionGateway.createPreApproval({
            companyId: String(company._id),
            plan: subscription.plan,
            payerEmail,
        })

        if (!mpSubscription.id || !mpSubscription.init_point) {
            if (mpSubscription.id) {
                await this.mpSubscriptionGateway.cancelPreApproval(mpSubscription.id)
            }
            throw new ValidationError(
                "Mercado Pago no devolvió un checkout válido. Intentá de nuevo."
            )
        }

        if (status === "inactive") {
            this.assertTransition(status, "pending")
        }

        await this.subscriptionRepository.updateStatus(companyId, "pending", {
            mpPreapprovalId: mpSubscription.id,
            startDate: new Date(),
            nextPaymentDate: mpSubscription.next_payment_date,
        })

        if (input.payer_email || !company.payer_email) {
            await this.companyRepository.updateById(companyId, {
                $set: { payer_email: payerEmail, updatedAt: new Date() },
            })
        }

        return { init_point: mpSubscription.init_point }
    }

    /**
     * Reintenta el checkout de un upgrade en curso (status upgrading).
     */
    async resumeUpgrade(
        companyId: string,
        input: { payer_email?: string } = {}
    ): Promise<{ init_point: string }> {
        const company = await this.companyRepository.findById(companyId)
        if (!company) throw new NotFoundError("Empresa no encontrada.")

        const subscription =
            await this.subscriptionRepository.findByCompanyId(companyId)
        if (!subscription || subscription.status !== "upgrading") {
            throw new ValidationError(
                "No hay un cambio de plan en curso para reintentar."
            )
        }

        const pendingPlan = subscription.pendingPlan
        const previousId = subscription.previousPreapprovalId
        if (!pendingPlan || !previousId) {
            throw new ValidationError(
                "El cambio de plan está incompleto. Cancelalo e intentá de nuevo."
            )
        }

        const payerEmail = (
            input.payer_email?.trim() ||
            company.payer_email ||
            ""
        ).toLowerCase()
        if (!payerEmail) {
            throw new ValidationError(
                "Falta el correo del pagador. Completalo e intentá de nuevo."
            )
        }

        const currentNewId = subscription.mpPreapprovalId as string

        const mpSubscription = await this.mpSubscriptionGateway.createPreApproval({
            companyId: String(company._id),
            plan: pendingPlan,
            payerEmail,
        })

        if (!mpSubscription.id || !mpSubscription.init_point) {
            if (mpSubscription.id) {
                await this.mpSubscriptionGateway.cancelPreApproval(mpSubscription.id)
            }
            throw new ValidationError(
                "Mercado Pago no devolvió un checkout válido. Intentá de nuevo."
            )
        }

        // Swap CAS: si el webhook/abort ganó, no tocamos DB y cancelamos el nuevo.
        const swapped = await this.subscriptionRepository.claimResumeUpgradeSwap(
            companyId,
            currentNewId,
            mpSubscription.id,
            previousId,
            pendingPlan
        )
        if (!swapped) {
            await this.mpSubscriptionGateway.cancelPreApproval(mpSubscription.id)
            throw new ValidationError(
                "El cambio de plan ya no está en curso. Recargá el panel."
            )
        }

        if (currentNewId && currentNewId !== previousId) {
            await this.mpSubscriptionGateway.cancelPreApproval(currentNewId)
        }

        if (input.payer_email || !company.payer_email) {
            await this.companyRepository.updateById(companyId, {
                $set: { payer_email: payerEmail, updatedAt: new Date() },
            })
        }

        return { init_point: mpSubscription.init_point }
    }

    /**
     * Aborta un upgrade en curso: cancela el preapproval nuevo y restaura el anterior.
     * Primero reclama la DB (CAS) para no pelearse con un webhook authorized.
     * Desde free, previous es FREE_UPGRADE_MARKER y se limpia el mpPreapprovalId.
     */
    async abortUpgrade(companyId: string): Promise<{ status: string }> {
        const subscription =
            await this.subscriptionRepository.findByCompanyId(companyId)
        if (!subscription || subscription.status !== "upgrading") {
            throw new ValidationError("No hay un cambio de plan en curso para cancelar.")
        }

        const previousId = subscription.previousPreapprovalId
        const newPreapprovalId = subscription.mpPreapprovalId
        if (!previousId || !newPreapprovalId) {
            throw new ValidationError(
                "No se pudo restaurar la suscripción anterior. Contactá soporte."
            )
        }

        if (previousId === FREE_UPGRADE_MARKER) {
            const claimed =
                await this.subscriptionRepository.claimAbortFreeUpgrade(
                    companyId,
                    newPreapprovalId
                )
            if (!claimed) {
                throw new ValidationError(
                    "El cambio de plan ya se confirmó o fue cancelado. Recargá el panel."
                )
            }
            await this.mpSubscriptionGateway.cancelPreApproval(newPreapprovalId)
            return { status: "active" }
        }

        const claimed = await this.subscriptionRepository.claimAbortUpgrade(
            companyId,
            newPreapprovalId,
            previousId
        )
        if (!claimed) {
            throw new ValidationError(
                "El cambio de plan ya se confirmó o fue cancelado. Recargá el panel."
            )
        }

        if (newPreapprovalId !== previousId) {
            await this.mpSubscriptionGateway.cancelPreApproval(newPreapprovalId)
        }

        return { status: "active" }
    }

    /**
     * Borra empresas cuya suscripción quedó pending más de `olderThanDays` días.
     */
    async cleanupStalePending(olderThanDays = 3): Promise<{ cleaned: number }> {
        const cutoff = new Date()
        cutoff.setDate(cutoff.getDate() - olderThanDays)

        const stale = await this.subscriptionRepository.findPendingOlderThan(cutoff)
        let cleaned = 0

        for (const subscription of stale) {
            try {
                if (subscription.mpPreapprovalId) {
                    await this.mpSubscriptionGateway.cancelPreApproval(
                        subscription.mpPreapprovalId
                    )
                }
                await this.subscriptionRepository.deleteById(subscription._id)
                await this.companyRepository.deleteById(subscription.companyId)
                cleaned += 1
            } catch (error) {
                logger.error(
                    {
                        err: error,
                        subscriptionId: String(subscription._id),
                        companyId: String(subscription.companyId),
                    },
                    "Error limpiando suscripción pending vencida"
                )
            }
        }

        if (cleaned > 0) {
            logger.info({ cleaned, olderThanDays }, "Limpieza de pending vencidos")
        }

        return { cleaned }
    }

    /**
     * Aborta upgrades stuck y recupera downgrading/cancelling stale.
     */
    async cleanupStaleTransitions(
        olderThanDays = 3
    ): Promise<{ abortedUpgrades: number; fixedOther: number }> {
        const cutoff = new Date()
        cutoff.setDate(cutoff.getDate() - olderThanDays)

        let abortedUpgrades = 0
        let fixedOther = 0

        const staleUpgrades =
            await this.subscriptionRepository.findUpgradingOlderThan(cutoff)

        for (const subscription of staleUpgrades) {
            try {
                await this.abortUpgrade(String(subscription.companyId))
                abortedUpgrades += 1
            } catch (error) {
                logger.error(
                    {
                        err: error,
                        companyId: String(subscription.companyId),
                    },
                    "Error abortando upgrade stale"
                )
            }
        }

        const staleDowngrades =
            await this.subscriptionRepository.findStaleByStatus(
                "downgrading",
                cutoff
            )
        for (const subscription of staleDowngrades) {
            try {
                await this.subscriptionRepository.clearTransitionFields(
                    subscription.companyId,
                    { status: "active" }
                )
                fixedOther += 1
                logger.warn(
                    { companyId: String(subscription.companyId) },
                    "Downgrading stale forzado a active"
                )
            } catch (error) {
                logger.error(
                    { err: error, companyId: String(subscription.companyId) },
                    "Error recuperando downgrading stale"
                )
            }
        }

        const staleCancelling =
            await this.subscriptionRepository.findStaleByStatus(
                "cancelling",
                cutoff
            )
        for (const subscription of staleCancelling) {
            try {
                if (subscription.mpPreapprovalId) {
                    await this.mpSubscriptionGateway.cancelPreApproval(
                        subscription.mpPreapprovalId
                    )
                }
                await this.subscriptionRepository.clearTransitionFields(
                    subscription.companyId,
                    { status: "inactive" }
                )
                fixedOther += 1
                logger.warn(
                    { companyId: String(subscription.companyId) },
                    "Cancelling stale forzado a inactive"
                )
            } catch (error) {
                logger.error(
                    { err: error, companyId: String(subscription.companyId) },
                    "Error recuperando cancelling stale"
                )
            }
        }

        return { abortedUpgrades, fixedOther }
    }

    /**
     * Webhook subscription_preapproval: autorizaciones, pendientes y cancelaciones.
     */
    async handlePreapprovalWebhook(preapprovalId: string): Promise<{
        status: number
        payload: Record<string, unknown>
    }> {
        logger.info("Notificación de suscripción recibida.")
        const preapproval = await new PreApproval(mercadoPagoAedes).get({
            id: preapprovalId,
        })
        const companyId = preapproval.external_reference as string
        const company = await this.companyRepository.findById(companyId)

        if (!company) throw new NotFoundError("Empresa no encontrada.")

        const subscription =
            (await this.subscriptionRepository.findByCompanyId(companyId)) ||
            (await this.subscriptionRepository.findByMpPreapprovalId(preapprovalId))

        const currentStatus = subscription?.status
        const currentPreapprovalId = subscription?.mpPreapprovalId
        const previousPreapprovalId = subscription?.previousPreapprovalId

        if (preapproval.status === "authorized") {
            return this.onAuthorized(
                companyId,
                company.email,
                subscription,
                preapproval,
                currentStatus
            )
        }

        if (preapproval.status === "pending") {
            if (this.notificationService) {
                await this.notificationService.sendRaw(
                    company.email,
                    "⏱️ Tu suscripción a Bookify está siendo procesada.",
                    `¡Hola!\n Tu suscripción a Bookify está siendo procesada en este momento.\n Te informaremos sobre el estado de tu pago en breves.\n ¡Gracias por confiar en nosotros!\n Si tienes dudas o necesitas ayuda, contáctanos a aedestechnologies@gmail.com.`,
                    `<div style="font-family: Arial, sans-serif; color: #262626;"><h2>¡Hola!</h2><p>Tu suscripción a <strong>Bookify</strong> está siendo <span style="color:rgb(228, 157, 26); font-weight: bold;">procesada</span> en este momento.</p><p>Te informaremos sobre el estado del pago en breves.</p><p>¡Gracias por confiar en nosotros!</p><br/><p style="font-size: 0.9em; color: #888;">Si tienes dudas o necesitas ayuda, contáctanos a aedestechnologies@gmail.com.</p></div>`
                )
            }
            return { status: 200, payload: { data: "Received" } }
        }

        if (preapproval.status === "cancelled") {
            return this.onCancelled(
                companyId,
                company.email,
                preapproval.id as string,
                currentStatus,
                currentPreapprovalId,
                previousPreapprovalId,
                subscription
            )
        }

        // paused / rejected / etc.: no borrar un upgrade a medias.
        const eventPreapprovalId = preapproval.id as string | undefined
        if (
            currentStatus === "upgrading" &&
            eventPreapprovalId &&
            eventPreapprovalId === currentPreapprovalId &&
            previousPreapprovalId
        ) {
            logger.warn(
                { preapprovalId: eventPreapprovalId, status: preapproval.status },
                "Preapproval nuevo en estado no autorizado — rollback a previous"
            )
            if (previousPreapprovalId === FREE_UPGRADE_MARKER) {
                await this.subscriptionRepository.clearTransitionFields(
                    companyId,
                    { status: "active" }
                )
                await this.subscriptionRepository.unsetMpPreapproval(companyId)
            } else {
                await this.subscriptionRepository.clearTransitionFields(
                    companyId,
                    {
                        status: "active",
                        mpPreapprovalId: previousPreapprovalId,
                    }
                )
            }
            return { status: 200, payload: { data: "Received" } }
        }

        if (
            currentStatus === "upgrading" &&
            eventPreapprovalId &&
            eventPreapprovalId === previousPreapprovalId
        ) {
            logger.info(
                { preapprovalId: eventPreapprovalId, status: preapproval.status },
                "Estado no-final del previous durante upgrade — ignorado."
            )
            return { status: 200, payload: { data: "Received" } }
        }

        if (
            currentStatus === "pending" &&
            eventPreapprovalId === currentPreapprovalId
        ) {
            await this.subscriptionRepository.updateStatus(companyId, "inactive")
            if (this.notificationService) {
                await this.notificationService.sendRaw(
                    company.email,
                    "❌ Tu suscripción a Bookify ha sido rechazada",
                    `¡Lo sentimos!\n Tu suscripción a Bookify ha sido rechazada.\n Por favor, contacta al soporte para resolver el problema.\n`,
                    `<div style="font-family: Arial, sans-serif; color: #262626;"><h2>❌ ¡Lo sentimos!</h2><p>Tu suscripción a <strong>Bookify</strong> ha sido <span style="color: #e74c3c; font-weight: bold;">rechazada</span>.</p><p>Por favor, contacta al soporte para resolver el problema.</p><br/><p style="font-size: 0.9em; color: #888;">Si tienes dudas o necesitas ayuda, contáctanos a aedestechnologies@gmail.com.</p></div>`
                )
            }
            if (subscription) {
                notifyAedesFlow(
                    buildPaymentPayload(
                        "payment.failed",
                        company,
                        subscription,
                        {
                            external_id: `preapproval_reject_${eventPreapprovalId}`,
                            amount: namesAndAmounts[subscription.plan]?.price ?? 0,
                            currency: "ARS",
                            failure_reason: String(preapproval.status || "rejected"),
                        }
                    )
                )
            }
            return { status: 200, payload: { data: "Received" } }
        }

        logger.info(
            {
                preapprovalId: eventPreapprovalId,
                status: preapproval.status,
                currentStatus,
            },
            "Evento de suscripción no procesado"
        )
        return { status: 200, payload: { data: "Received" } }
    }

    private async onAuthorized(
        companyId: string,
        companyEmail: string,
        subscription: SubscriptionDocument | null,
        preapproval: {
            id?: string
            next_payment_date?: string
        },
        currentStatus: SubscriptionStatus | undefined
    ) {
        logger.info("Suscripción aprobada.")

        const preapprovalId = preapproval.id
        if (!preapprovalId) {
            return { status: 200, payload: { data: "Received" } }
        }

        // Idempotencia: ya active con el mismo preapproval → no reenviar mails.
        if (
            currentStatus === "active" &&
            subscription?.mpPreapprovalId === preapprovalId
        ) {
            return { status: 200, payload: { data: "Received" } }
        }

        // Authorized tardío de un preapproval que ya no es el vigente (p.ej. abort).
        if (
            subscription?.mpPreapprovalId &&
            preapprovalId !== subscription.mpPreapprovalId &&
            currentStatus !== "upgrading"
        ) {
            logger.info(
                { preapprovalId, current: subscription.mpPreapprovalId },
                "Authorized de preapproval no vigente — ignorado."
            )
            return { status: 200, payload: { data: "Received" } }
        }

        const wasUpgrading = currentStatus === "upgrading"
        const previousId = subscription?.previousPreapprovalId
        const plan: SubscriptionPlan = wasUpgrading
            ? (subscription?.pendingPlan ?? subscription?.plan ?? "individual")
            : (subscription?.plan ?? "individual")

        if (wasUpgrading) {
            const claimed = await this.subscriptionRepository.claimAuthorizedUpgrade(
                companyId,
                preapprovalId,
                plan,
                preapproval.next_payment_date
            )
            if (!claimed) {
                logger.info(
                    { preapprovalId, companyId },
                    "Authorized upgrade no reclamado (abort u otro webhook ganó)"
                )
                // Si abortó, no debemos dejar el nuevo cobrando.
                await this.mpSubscriptionGateway.cancelPreApproval(preapprovalId)
                return { status: 200, payload: { data: "Received" } }
            }

            if (previousId && previousId !== FREE_UPGRADE_MARKER) {
                await this.mpSubscriptionGateway.cancelPreApproval(previousId)
            }
            await this.applyPlanBenefits(companyId, plan)
            await this.notifySubscriptionApproved(companyEmail, true)
            await this.pushAedesFlowSubscriptionUpserted(companyId, plan)
            return { status: 200, payload: { data: "Received" } }
        }

        if (currentStatus === "pending") {
            const claimed = await this.subscriptionRepository.claimAuthorizedPending(
                companyId,
                preapprovalId,
                preapproval.next_payment_date
            )
            if (!claimed) {
                const latest =
                    await this.subscriptionRepository.findByCompanyId(companyId)
                if (
                    latest?.status === "active" &&
                    latest.mpPreapprovalId === preapprovalId
                ) {
                    return { status: 200, payload: { data: "Received" } }
                }
                logger.info(
                    { preapprovalId, companyId },
                    "Authorized pending no reclamado — ignorado."
                )
                return { status: 200, payload: { data: "Received" } }
            }

            const upserted =
                await this.subscriptionRepository.findByCompanyId(companyId)
            const company = await this.companyRepository.findById(companyId)
            if (upserted && company && !company.subscriptionId) {
                await this.companyRepository.updateById(companyId, {
                    $set: { subscriptionId: upserted._id },
                })
            }

            await this.applyPlanBenefits(companyId, plan)
            await this.notifySubscriptionApproved(companyEmail, false)
            await this.pushAedesFlowSubscriptionUpserted(companyId, plan)
            return { status: 200, payload: { data: "Received" } }
        }

        // Sin subscription aún (carrera con register) o estado inesperado:
        // upsert solo si no hay otra suscripción activa con distinto preapproval.
        if (!subscription || !currentStatus) {
            await this.subscriptionRepository.upsertForCompany({
                companyId,
                mpPreapprovalId: preapprovalId,
                plan,
                pendingPlan: null,
                status: "active",
                startDate: new Date(),
                nextPaymentDate: preapproval.next_payment_date,
                previousPreapprovalId: null,
                transitionStartedAt: null,
            })
            const upserted =
                await this.subscriptionRepository.findByCompanyId(companyId)
            const company = await this.companyRepository.findById(companyId)
            if (upserted && company && !company.subscriptionId) {
                await this.companyRepository.updateById(companyId, {
                    $set: { subscriptionId: upserted._id },
                })
            }
            await this.applyPlanBenefits(companyId, plan)
            await this.notifySubscriptionApproved(companyEmail, false)
            await this.pushAedesFlowSubscriptionUpserted(companyId, plan)
            return { status: 200, payload: { data: "Received" } }
        }

        logger.info(
            { preapprovalId, currentStatus },
            "Authorized ignorado por estado no aplicable"
        )
        return { status: 200, payload: { data: "Received" } }
    }

    private async notifySubscriptionApproved(
        companyEmail: string,
        wasPlanChange: boolean
    ) {
        if (!this.notificationService) return
        const subject = wasPlanChange
            ? "🚀 Cambio de plan realizado con éxito"
            : "✅ Tu suscripción a Bookify ha sido aprobada"
        const text = wasPlanChange
            ? `¡Felicitaciones!\n Has cambiado de plan exitosamente.\n Ya puedes disfrutar de todos los beneficios y funcionalidades de nuestro sistema.\n ¡Gracias por confiar en nosotros!\n Si tienes dudas o necesitas ayuda, contáctanos a aedestechnologies@gmail.com.`
            : `¡Felicitaciones!\n Tu suscripción a Bookify ha sido aprobada con éxito.\n Ya puedes disfrutar de todos los beneficios y funcionalidades de nuestro sistema.\n ¡Gracias por confiar en nosotros!\n Si tienes dudas o necesitas ayuda, contáctanos a aedestechnologies@gmail.com.`
        const html = wasPlanChange
            ? `<div style="font-family: Arial, sans-serif; color: #262626;"><h2>🎉 ¡Felicitaciones!</h2><p>Has cambiado de plan <span style="color: #27ae60; font-weight: bold;">exitosamente</span>.</p><p>Ya puedes disfrutar de todos los beneficios y funcionalidades del sistema.</p><p>¡Gracias por confiar en nosotros!</p><br/><p style="font-size: 0.9em; color: #888;">Si tienes dudas o necesitas ayuda, contáctanos a aedestechnologies@gmail.com.</p></div>`
            : `<div style="font-family: Arial, sans-serif; color: #262626;"><h2>🎉 ¡Felicitaciones!</h2><p>Tu suscripción a <strong>Bookify</strong> ha sido <span style="color: #27ae60; font-weight: bold;">aprobada</span> con éxito.</p><p>Ya puedes disfrutar de todos los beneficios y funcionalidades del sistema.</p><p>¡Gracias por confiar en nosotros!</p><br/><p style="font-size: 0.9em; color: #888;">Si tienes dudas o necesitas ayuda, contáctanos a aedestechnologies@gmail.com.</p></div>`

        await this.notificationService.sendRaw(companyEmail, subject, text, html)
    }

    private async onCancelled(
        companyId: string,
        companyEmail: string,
        cancelledPreapprovalId: string,
        currentStatus: SubscriptionStatus | undefined,
        currentPreapprovalId: string | undefined,
        previousPreapprovalId: string | undefined,
        _subscription: SubscriptionDocument | null
    ) {
        // Cancel del preapproval ANTERIOR durante upgrade: ignorar
        // (tras authorized lo cancelamos nosotros; o no debería cancelarse antes).
        if (
            currentStatus === "upgrading" &&
            previousPreapprovalId &&
            cancelledPreapprovalId === previousPreapprovalId
        ) {
            logger.info(
                "Cancel de preapproval anterior durante upgrade — ignorado."
            )
            return { status: 200, payload: { data: "Received" } }
        }

        // Upgrade fallido: se canceló el NUEVO → restaurar previous (plan no cambió).
        if (
            currentStatus === "upgrading" &&
            currentPreapprovalId &&
            cancelledPreapprovalId === currentPreapprovalId
        ) {
            logger.info("Upgrade fallido — rollback a active.")
            if (previousPreapprovalId === FREE_UPGRADE_MARKER) {
                await this.subscriptionRepository.clearTransitionFields(
                    companyId,
                    { status: "active" }
                )
                await this.subscriptionRepository.unsetMpPreapproval(companyId)
            } else {
                const restoreId = previousPreapprovalId ?? currentPreapprovalId
                await this.subscriptionRepository.clearTransitionFields(
                    companyId,
                    {
                        status: "active",
                        mpPreapprovalId: restoreId,
                    }
                )
            }
            return { status: 200, payload: { data: "Received" } }
        }

        // Downgrade a free: cancelamos el PreApproval de MP a propósito.
        // El plan free no depende de MP; el webhook no debe pasar a inactive.
        if (
            _subscription?.plan === FREE_PLAN &&
            (currentStatus === "active" || currentStatus === "downgrading")
        ) {
            logger.info(
                { companyId, cancelledPreapprovalId },
                "Cancel de preapproval en plan free — ignorado."
            )
            return { status: 200, payload: { data: "Received" } }
        }

        if (currentStatus === "cancelling" || currentStatus === "active") {
            // Sin PreApproval vigente, un cancel viejo no aplica (p.ej. race
            // post-unset). Antes, `!currentPreapprovalId` caía a inactive.
            if (
                !currentPreapprovalId ||
                cancelledPreapprovalId !== currentPreapprovalId
            ) {
                return { status: 200, payload: { data: "Received" } }
            }

            await this.subscriptionRepository.updateStatus(companyId, "inactive")

            // Solo mail si canceló MP (status active). Si venimos de
            // cancelling, el mail ya lo mandó `cancel()` del panel.
            if (currentStatus === "active") {
                await this.notifySubscriptionCancelled(companyEmail)
                await this.pushAedesFlowSubscriptionCanceled(
                    companyId,
                    _subscription
                )
            }
        }

        return { status: 200, payload: { data: "Received" } }
    }

    private async notifySubscriptionCancelled(companyEmail: string) {
        if (!this.notificationService) return
        await this.notificationService.sendRaw(
            companyEmail,
            "Tu suscripción a Bookify ha sido cancelada correctamente",
            `¡Hola!\n Tu suscripción a Bookify ha sido cancelada correctamente.\n`,
            `<div style="font-family: Arial, sans-serif; color: #262626;"><h2>¡Hola!</h2><p>Tu suscripción a <strong>Bookify</strong> ha sido <span style="color: #e74c3c; font-weight: bold;">cancelada</span> correctamente.</p><br/><p style="font-size: 0.9em; color: #888;">Si tienes dudas o necesitas ayuda, contáctanos a aedestechnologies@gmail.com.</p></div>`
        )
    }

    private async pushAedesFlowSubscriptionUpserted(
        companyId: string,
        planOverride?: SubscriptionPlan
    ) {
        try {
            const company = await this.companyRepository.findById(companyId)
            const subscription =
                await this.subscriptionRepository.findByCompanyId(companyId)
            if (!company || !subscription) return

            const plan = planOverride ?? subscription.plan
            notifyAedesFlow(buildCustomerUpsertedPayload(company))
            notifyAedesFlow(
                buildSubscriptionUpsertedPayload(
                    company,
                    {
                        _id: subscription._id,
                        plan,
                        status: "active",
                        startDate: subscription.startDate,
                        nextPaymentDate: subscription.nextPaymentDate,
                    },
                    { status: "active" }
                )
            )
        } catch (err) {
            logger.warn(
                { err, companyId },
                "No se pudo armar payload AedesFlow (subscription.upserted)"
            )
        }
    }

    private async pushAedesFlowSubscriptionCanceled(
        companyId: string,
        subscription: SubscriptionDocument | null
    ) {
        try {
            const company = await this.companyRepository.findById(companyId)
            const sub =
                subscription ||
                (await this.subscriptionRepository.findByCompanyId(companyId))
            if (!company || !sub) return
            notifyAedesFlow(buildSubscriptionCanceledPayload(company, sub))
        } catch (err) {
            logger.warn(
                { err, companyId },
                "No se pudo armar payload AedesFlow (subscription.canceled)"
            )
        }
    }

    /**
     * Webhook subscription_authorized_payment: cobros recurrentes de la suscripción.
     */
    async handleAuthorizedPaymentWebhook(authorizedPaymentId: string): Promise<{
        status: number
        payload: Record<string, unknown>
    }> {
        logger.info(
            { authorizedPaymentId },
            "Notificación de pago de suscripción recibida."
        )

        const invoice =
            await this.mpSubscriptionGateway.getAuthorizedPayment(
                authorizedPaymentId
            )
        if (!invoice?.preapproval_id) {
            return { status: 200, payload: { data: "Received" } }
        }

        const subscription =
            await this.subscriptionRepository.findByMpPreapprovalId(
                invoice.preapproval_id
            )
        if (!subscription) {
            logger.warn(
                { preapprovalId: invoice.preapproval_id },
                "Authorized payment sin suscripción local"
            )
            return { status: 200, payload: { data: "Received" } }
        }

        const company = await this.companyRepository.findById(
            subscription.companyId
        )
        if (!company) {
            return { status: 200, payload: { data: "Received" } }
        }

        const mpPayment = invoice.payment
        const paymentStatus = (mpPayment?.status || "").toLowerCase()
        const externalId = String(
            mpPayment?.id ?? invoice.id ?? authorizedPaymentId
        )
        const amount = Number(invoice.transaction_amount ?? 0)
        const currency = (invoice.currency_id || "ARS").toUpperCase()
        const occurredAt =
            invoice.debit_date ||
            invoice.date_created ||
            new Date().toISOString()

        let event: "payment.succeeded" | "payment.failed" | "payment.refunded"
        if (
            paymentStatus === "refunded" ||
            paymentStatus === "charged_back"
        ) {
            event = "payment.refunded"
        } else if (
            paymentStatus === "approved" ||
            paymentStatus === "accredited"
        ) {
            event = "payment.succeeded"
        } else if (
            paymentStatus === "rejected" ||
            paymentStatus === "cancelled" ||
            paymentStatus === "canceled"
        ) {
            event = "payment.failed"
        } else {
            logger.info(
                { paymentStatus, authorizedPaymentId },
                "Authorized payment en estado intermedio — sin notify AedesFlow"
            )
            return { status: 200, payload: { data: "Received" } }
        }

        notifyAedesFlow(
            buildPaymentPayload(event, company, subscription, {
                external_id: externalId,
                amount,
                currency,
                failure_reason:
                    event === "payment.failed"
                        ? mpPayment?.status_detail
                        : undefined,
                occurred_at: occurredAt,
            })
        )

        return { status: 200, payload: { data: "Received" } }
    }
}
