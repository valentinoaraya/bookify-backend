import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { Types } from "mongoose"
import {
	arsToUsd,
	buildAedesFlowPlan,
	buildCustomerUpsertedPayload,
	buildSubscriptionUpsertedPayload,
	buildSubscriptionCanceledPayload,
	buildPaymentPayload,
	notifyAedesFlowAsync,
} from "@/infrastructure/aedesflow"
import { env } from "@/config/env"

describe("aedesflow mapper", () => {
	it("buildAedesFlowPlan usa codes estables del plan Bookify", () => {
		const plan = buildAedesFlowPlan("individual_plus")
		expect(plan.code).toBe("individual_plus")
		expect(plan.name).toContain("Individual Plus")
		expect(plan.interval).toBe("month")
	})

	it("arsToUsd usa AEDESFLOW_USD_ARS_RATE cuando existe", () => {
		const prev = env.AEDESFLOW_USD_ARS_RATE
		;(env as { AEDESFLOW_USD_ARS_RATE?: number }).AEDESFLOW_USD_ARS_RATE = 1000
		expect(arsToUsd(9900)).toBe(9.9)
		;(env as { AEDESFLOW_USD_ARS_RATE?: number }).AEDESFLOW_USD_ARS_RATE = prev
	})

	it("subscription.upserted incluye plan.code y customer.external_id estable", () => {
		const companyId = new Types.ObjectId()
		const subId = new Types.ObjectId()
		const payload = buildSubscriptionUpsertedPayload(
			{ _id: companyId, email: "a@b.com", name: "Acme" },
			{
				_id: subId,
				plan: "team",
				status: "active",
				startDate: new Date("2026-01-01T00:00:00.000Z"),
			},
		)

		expect(payload.event).toBe("subscription.upserted")
		expect(payload.product).toBe("bookify")
		expect(payload.customer.external_id).toBe(String(companyId))
		expect(payload.subscription?.external_id).toBe(String(subId))
		expect(payload.subscription?.plan?.code).toBe("team")
		expect(payload.subscription?.status).toBe("active")
	})

	it("subscription.canceled fuerza status canceled y mrr 0", () => {
		const payload = buildSubscriptionCanceledPayload(
			{
				_id: new Types.ObjectId(),
				email: "a@b.com",
				name: "Acme",
			},
			{
				_id: new Types.ObjectId(),
				plan: "individual_plus",
				status: "inactive",
			},
		)
		expect(payload.event).toBe("subscription.canceled")
		expect(payload.subscription?.status).toBe("canceled")
		expect(payload.subscription?.mrr_usd).toBe(0)
		expect(payload.subscription?.plan?.code).toBe("individual_plus")
	})

	it("payment payload usa idempotency_key estable", () => {
		const payload = buildPaymentPayload(
			"payment.succeeded",
			{
				_id: new Types.ObjectId(),
				email: "a@b.com",
				name: "Acme",
			},
			{
				_id: new Types.ObjectId(),
				plan: "individual_plus",
				status: "active",
			},
			{
				external_id: "pay_1",
				amount: 9900,
				currency: "ARS",
			},
		)
		expect(payload.idempotency_key).toBe(
			"bookify:payment.succeeded:pay_1",
		)
		expect(payload.payment?.currency).toBe("ARS")
		expect(payload.payment?.amount).toBe(9900)
	})

	it("customer.upserted no usa email como external_id", () => {
		const id = new Types.ObjectId()
		const payload = buildCustomerUpsertedPayload({
			_id: id,
			email: "cliente@ejemplo.com",
			name: "Cliente",
		})
		expect(payload.customer.external_id).toBe(String(id))
		expect(payload.customer.external_id).not.toBe("cliente@ejemplo.com")
	})
})

describe("notifyAedesFlowAsync", () => {
	const originalFetch = global.fetch
	const originalSecret = env.SAAS_WEBHOOK_SECRET

	beforeEach(() => {
		vi.restoreAllMocks()
	})

	afterEach(() => {
		global.fetch = originalFetch
		;(env as { SAAS_WEBHOOK_SECRET: string }).SAAS_WEBHOOK_SECRET =
			originalSecret
	})

	it("no-op si falta SAAS_WEBHOOK_SECRET", async () => {
		;(env as { SAAS_WEBHOOK_SECRET: string }).SAAS_WEBHOOK_SECRET = ""
		global.fetch = vi.fn()
		const result = await notifyAedesFlowAsync(
			buildCustomerUpsertedPayload({
				_id: new Types.ObjectId(),
				email: "a@b.com",
				name: "Acme",
			}),
		)
		expect(result.ok).toBe(false)
		expect(global.fetch).not.toHaveBeenCalled()
	})

	it("reintenta ante 5xx y termina ok si luego responde 200", async () => {
		;(env as { SAAS_WEBHOOK_SECRET: string }).SAAS_WEBHOOK_SECRET =
			"test-secret"
		global.fetch = vi
			.fn()
			.mockResolvedValueOnce({
				ok: false,
				status: 503,
				text: async () => "busy",
			})
			.mockResolvedValueOnce({
				ok: true,
				status: 200,
				text: async () => "ok",
			})

		const result = await notifyAedesFlowAsync(
			buildCustomerUpsertedPayload({
				_id: new Types.ObjectId(),
				email: "a@b.com",
				name: "Acme",
			}),
		)

		expect(result.ok).toBe(true)
		expect(global.fetch).toHaveBeenCalledTimes(2)
		const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock
			.calls[0]
		expect(init.headers.Authorization).toBe("Bearer test-secret")
	})
})
