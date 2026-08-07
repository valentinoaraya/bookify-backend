import { PreApproval } from "mercadopago";
import { mercadoPagoAedes } from "../../services/mercadopagoService";
import { namesAndAmounts } from "../../utils/planRules";
import { PlanType } from "../../modules/company/company.types";
import { logger } from "../../shared/logger";
import { ACCESS_TOKEN_MP_AEDES } from "../../config";

export interface CreatePreApprovalInput {
	companyId: string;
	plan: PlanType;
	payerEmail: string;
}

export interface PreApprovalResult {
	id?: string;
	init_point?: string;
	next_payment_date?: string;
	status?: string;
}

export interface AuthorizedPaymentResult {
	id?: string | number;
	preapproval_id?: string;
	transaction_amount?: number;
	currency_id?: string;
	debit_date?: string;
	date_created?: string;
	payment?: {
		id?: string | number;
		status?: string;
		status_detail?: string;
	};
}

/**
 * Gateway de suscripciones SaaS (token Aedes).
 * Separa la SDK de Mercado Pago de la lógica de negocio.
 */
export class MercadoPagoSubscriptionGateway {
	async createPreApproval(
		input: CreatePreApprovalInput,
	): Promise<PreApprovalResult> {
		const planInfo = namesAndAmounts[input.plan];

		const suscription = await new PreApproval(mercadoPagoAedes).create({
			body: {
				back_url: "https://bookify.aedestec.com/processingpayment",
				reason: `Suscripción Bookify - ${planInfo.name}`,
				auto_recurring: {
					frequency: 1,
					frequency_type: "months",
					transaction_amount: planInfo.price,
					currency_id: "ARS",
				},
				payer_email: input.payerEmail,
				status: "pending",
				external_reference: `${input.companyId}`,
			},
		});

		return {
			id: suscription.id,
			init_point: suscription.init_point,
			next_payment_date: suscription.next_payment_date,
			status: suscription.status,
		};
	}

	async cancelPreApproval(preapprovalId: string): Promise<void> {
		try {
			await new PreApproval(mercadoPagoAedes).update({
				id: preapprovalId as any,
				body: { status: "cancelled" },
			});
		} catch (error) {
			logger.error(
				{ err: error, preapprovalId },
				"No se pudo cancelar preapproval en Mercado Pago",
			);
		}
	}

	/**
	 * Invoice / cobro autorizado de una suscripción.
	 * GET /authorized_payments/{id}
	 */
	async getAuthorizedPayment(
		authorizedPaymentId: string,
	): Promise<AuthorizedPaymentResult | null> {
		try {
			const response = await fetch(
				`https://api.mercadopago.com/authorized_payments/${encodeURIComponent(authorizedPaymentId)}`,
				{
					method: "GET",
					headers: {
						Authorization: `Bearer ${ACCESS_TOKEN_MP_AEDES}`,
					},
				},
			);
			if (!response.ok) {
				const text = await response.text().catch(() => "");
				logger.warn(
					{
						authorizedPaymentId,
						status: response.status,
						body: text.slice(0, 300),
					},
					"No se pudo obtener authorized_payment de MP",
				);
				return null;
			}
			return (await response.json()) as AuthorizedPaymentResult;
		} catch (error) {
			logger.error(
				{ err: error, authorizedPaymentId },
				"Error fetch authorized_payment",
			);
			return null;
		}
	}
}
