import { namesAndAmounts } from "../../utils/planRules"
import { env } from "../../config/env"
import type { CompanyDocument } from "../../modules/company/company.types"
import type {
	SubscriptionDocument,
	SubscriptionPlan,
} from "../../modules/subscription/subscription.types"
import type {
	AedesFlowCustomer,
	AedesFlowPayment,
	AedesFlowPlan,
	AedesFlowSubscription,
	AedesFlowSubscriptionStatus,
	AedesFlowWebhookPayload,
} from "./aedesflow.types"

const PRODUCT = "bookify" as const

/** Convierte ARS → USD. Si no hay tasa, devolver 0 (contrato AedesFlow). */
export function arsToUsd(amountArs: number): number {
	const rate = env.AEDESFLOW_USD_ARS_RATE
	if (!rate || rate <= 0 || !Number.isFinite(amountArs)) return 0
	return Math.round((amountArs / rate) * 100) / 100
}

export function buildAedesFlowPlan(plan: SubscriptionPlan): AedesFlowPlan {
	const info = namesAndAmounts[plan]
	const amountArs = info?.price ?? 0
	return {
		code: plan,
		name: info?.name ?? plan,
		amount_usd: arsToUsd(amountArs),
		interval: "month",
	}
}

export function buildAedesFlowCustomer(
	company: Pick<CompanyDocument, "_id" | "email" | "name">,
): AedesFlowCustomer {
	return {
		external_id: String(company._id),
		email: company.email,
		name: company.name,
		company_name: company.name,
	}
}

export function mapSubscriptionStatus(
	status: SubscriptionDocument["status"],
): AedesFlowSubscriptionStatus {
	if (status === "inactive" || status === "cancelling") return "canceled"
	if (status === "pending") return "trialing"
	return "active"
}

export function buildAedesFlowSubscription(
	subscription: Pick<
		SubscriptionDocument,
		"_id" | "plan" | "status" | "startDate" | "nextPaymentDate"
	>,
	overrides?: Partial<AedesFlowSubscription>,
): AedesFlowSubscription {
	const plan = buildAedesFlowPlan(subscription.plan)
	const status = mapSubscriptionStatus(subscription.status)

	const base: AedesFlowSubscription = {
		external_id: String(subscription._id),
		status,
		mrr_usd: status === "canceled" ? 0 : plan.amount_usd,
		currency: "ARS",
		current_period_start: subscription.startDate
			? new Date(subscription.startDate).toISOString()
			: undefined,
		current_period_end: subscription.nextPaymentDate
			? new Date(subscription.nextPaymentDate).toISOString()
			: undefined,
		plan,
	}

	return {
		...base,
		...overrides,
		// checklist: siempre incluir plan.code en subscription.*
		plan: overrides?.plan ?? plan,
	}
}

export function buildCustomerUpsertedPayload(
	company: Pick<CompanyDocument, "_id" | "email" | "name">,
): AedesFlowWebhookPayload {
	return {
		event: "customer.upserted",
		product: PRODUCT,
		occurred_at: new Date().toISOString(),
		customer: buildAedesFlowCustomer(company),
	}
}

export function buildSubscriptionUpsertedPayload(
	company: Pick<CompanyDocument, "_id" | "email" | "name">,
	subscription: Pick<
		SubscriptionDocument,
		"_id" | "plan" | "status" | "startDate" | "nextPaymentDate"
	>,
	overrides?: Partial<AedesFlowSubscription>,
): AedesFlowWebhookPayload {
	return {
		event: "subscription.upserted",
		product: PRODUCT,
		occurred_at: new Date().toISOString(),
		customer: buildAedesFlowCustomer(company),
		subscription: buildAedesFlowSubscription(subscription, overrides),
	}
}

export function buildSubscriptionCanceledPayload(
	company: Pick<CompanyDocument, "_id" | "email" | "name">,
	subscription: Pick<
		SubscriptionDocument,
		"_id" | "plan" | "status" | "startDate" | "nextPaymentDate"
	>,
): AedesFlowWebhookPayload {
	const plan = buildAedesFlowPlan(subscription.plan)
	return {
		event: "subscription.canceled",
		product: PRODUCT,
		occurred_at: new Date().toISOString(),
		customer: buildAedesFlowCustomer(company),
		subscription: {
			external_id: String(subscription._id),
			status: "canceled",
			mrr_usd: 0,
			currency: "ARS",
			canceled_at: new Date().toISOString(),
			plan,
		},
	}
}

export function buildPaymentPayload(
	event: "payment.succeeded" | "payment.failed" | "payment.refunded",
	company: Pick<CompanyDocument, "_id" | "email" | "name">,
	subscription: Pick<
		SubscriptionDocument,
		"_id" | "plan" | "status" | "startDate" | "nextPaymentDate"
	> | null,
	payment: {
		external_id: string
		amount: number
		currency: string
		failure_reason?: string
		occurred_at?: string
	},
): AedesFlowWebhookPayload {
	const paymentBody: AedesFlowPayment = {
		external_id: payment.external_id,
		amount: payment.amount,
		currency: payment.currency,
		amount_usd:
			payment.currency.toUpperCase() === "USD"
				? payment.amount
				: arsToUsd(payment.amount),
		failure_reason: payment.failure_reason,
		occurred_at: payment.occurred_at ?? new Date().toISOString(),
	}

	return {
		event,
		product: PRODUCT,
		occurred_at: paymentBody.occurred_at,
		idempotency_key: `bookify:${event}:${payment.external_id}`,
		customer: buildAedesFlowCustomer(company),
		subscription: subscription
			? buildAedesFlowSubscription(subscription)
			: undefined,
		payment: paymentBody,
	}
}
