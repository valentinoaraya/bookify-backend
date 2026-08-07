export type AedesFlowProduct = "bookify" | "tu-repe"

export type AedesFlowEvent =
	| "customer.upserted"
	| "subscription.upserted"
	| "subscription.canceled"
	| "payment.succeeded"
	| "payment.failed"
	| "payment.refunded"

export type AedesFlowSubscriptionStatus =
	| "trialing"
	| "active"
	| "past_due"
	| "canceled"
	| "paused"

export type AedesFlowPlanInterval = "month" | "year" | "one_time"

export interface AedesFlowCustomer {
	external_id: string
	email?: string
	name?: string
	company_name?: string
}

export interface AedesFlowPlan {
	code: string
	name: string
	amount_usd: number
	interval: AedesFlowPlanInterval
}

export interface AedesFlowSubscription {
	external_id: string
	status: AedesFlowSubscriptionStatus
	mrr_usd: number
	currency?: string
	current_period_start?: string
	current_period_end?: string
	trial_ends_at?: string
	canceled_at?: string
	plan?: AedesFlowPlan
}

export interface AedesFlowPayment {
	external_id: string
	amount: number
	currency: string
	amount_usd: number
	failure_reason?: string
	occurred_at?: string
}

export interface AedesFlowWebhookPayload {
	event: AedesFlowEvent
	product: AedesFlowProduct
	occurred_at?: string
	idempotency_key?: string
	customer: AedesFlowCustomer
	subscription?: AedesFlowSubscription
	payment?: AedesFlowPayment
}
