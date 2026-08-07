import { env } from "../../config/env"
import { logger } from "../../shared/logger"
import type { AedesFlowWebhookPayload } from "./aedesflow.types"

const REQUEST_TIMEOUT_MS = 5_000
const MAX_ATTEMPTS = 3
const RETRY_DELAYS_MS = [300, 800]

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

function isConfigured(): boolean {
	return Boolean(env.AEDESFLOW_WEBHOOK_URL && env.SAAS_WEBHOOK_SECRET)
}

/**
 * POST al webhook de AedesFlow. Fire-and-forget: no propaga errores al caller.
 * Reintenta 2–3 veces ante 5xx / errores de red.
 */
export function notifyAedesFlow(payload: AedesFlowWebhookPayload): void {
	void notifyAedesFlowAsync(payload)
}

export async function notifyAedesFlowAsync(
	payload: AedesFlowWebhookPayload,
): Promise<{ ok: boolean; status?: number }> {
	if (!isConfigured()) {
		logger.debug(
			{ event: payload.event },
			"AedesFlow webhook omitido (URL o secret no configurados)",
		)
		return { ok: false }
	}

	const body = JSON.stringify(payload)
	let lastStatus: number | undefined

	for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
		const controller = new AbortController()
		const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

		try {
			const response = await fetch(env.AEDESFLOW_WEBHOOK_URL, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${env.SAAS_WEBHOOK_SECRET}`,
					"x-saas-webhook-secret": env.SAAS_WEBHOOK_SECRET,
				},
				body,
				signal: controller.signal,
			})

			lastStatus = response.status

			if (response.ok) {
				logger.info(
					{
						event: payload.event,
						idempotency_key: payload.idempotency_key,
						status: response.status,
					},
					"AedesFlow webhook enviado",
				)
				return { ok: true, status: response.status }
			}

			const responseText = await response.text().catch(() => "")
			const retryable = response.status >= 500

			logger.warn(
				{
					event: payload.event,
					status: response.status,
					attempt,
					body: responseText.slice(0, 300),
				},
				"AedesFlow webhook respondió error",
			)

			if (!retryable || attempt === MAX_ATTEMPTS) {
				return { ok: false, status: response.status }
			}
		} catch (err) {
			logger.warn(
				{ err, event: payload.event, attempt },
				"AedesFlow webhook falló (red/timeout)",
			)
			if (attempt === MAX_ATTEMPTS) {
				return { ok: false, status: lastStatus }
			}
		} finally {
			clearTimeout(timer)
		}

		await sleep(RETRY_DELAYS_MS[attempt - 1] ?? 800)
	}

	return { ok: false, status: lastStatus }
}
