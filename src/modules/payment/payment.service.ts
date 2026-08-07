import { env } from "../../config/env";
import {
	ForbiddenError,
	NotFoundError,
	ValidationError,
} from "../../shared/errors";
import { parseBaTz } from "../../shared/utils/datetime";
import { logger } from "../../shared/logger";
import { CompanyRepository } from "../company/company.repository";
import { ServiceRepository } from "../service/service.repository";
import { SubscriptionService } from "../subscription/subscription.service";
import { SubscriptionRepository } from "../subscription/subscription.repository";
import { planAllowsIntegrations } from "../../utils/planRules";
import { MercadoPagoPaymentGateway } from "./refund.gateway";
import { MpTokenService } from "./mp-token.service";
import { UserData } from "../../types";
import {
	assertBookable,
	assertBookingAnticipation,
} from "../appointment/booking-rules";
import { PendingReservationUserData } from "../pending-reservation/pending-reservation.types";

/** Puerto hacia AppointmentService para confirmación por webhook de pago. */
export interface PaymentAppointmentPort {
	confirmFromPaymentWebhook(body: {
		type?: string;
		action?: string;
		user_id?: string | number;
		data?: { id?: string };
	}): Promise<{ status: number; body: { data?: string; error?: string } }>;
}

export class PaymentService {
	private appointmentPort?: PaymentAppointmentPort;

	constructor(
		private readonly companyRepository: CompanyRepository,
		private readonly serviceRepository: ServiceRepository,
		private readonly paymentGateway: MercadoPagoPaymentGateway,
		private readonly subscriptionService: SubscriptionService,
		private readonly subscriptionRepository: SubscriptionRepository,
		private readonly mpTokenService: MpTokenService,
	) {}

	setAppointmentPort(port: PaymentAppointmentPort): void {
		this.appointmentPort = port;
	}

	async createPreference(
		empresaId: string,
		user: UserData,
		input: {
			serviceId: string;
			date: string;
			locationId?: string;
		},
		markPending: (
			serviceId: string,
			date: Date,
			userId: string,
			userData: PendingReservationUserData,
		) => Promise<string | null>,
		removePending: (
			serviceId: string,
			pendingId: string,
		) => Promise<boolean>,
	) {
		const { name, lastName, email, dni, phone } = user;
		const empresa = await this.companyRepository.findById(empresaId);
		const service = await this.serviceRepository.findById(input.serviceId);

		if (!service) throw new NotFoundError("Servicio no encontrado.");
		if (String(service.companyId) !== String(empresaId)) {
			throw new NotFoundError("Servicio no encontrado.");
		}
		if (service.signPrice <= 0) {
			throw new ValidationError(
				"El servicio no requiere seña. Vuelve al panel principal e intenta volver a sacarlo.",
			);
		}
		if (!empresa || !empresa.mp_access_token) {
			throw new NotFoundError(
				"La empresa no está vinculada con Mercado Pago",
			);
		}

		const dateObj = parseBaTz(input.date);

		// Se valida antes de cobrar: si el turno no es reservable, no tiene
		// sentido crear la preferencia y después reembolsar.
		assertBookable(service, dateObj);
		assertBookingAnticipation(empresa, dateObj);

		if (
			service.mode === "in-person" &&
			(service.locationIds || []).length > 1 &&
			!input.locationId
		) {
			throw new ValidationError("Seleccioná una sede para el turno.");
		}

		const userId = `${name}_${lastName}_${email}`;
		const pendingId = await markPending(input.serviceId, dateObj, userId, {
			name,
			lastName,
			email,
			dni: String(dni),
			phone: String(phone),
			userLocation: user.userLocation,
			locationId: input.locationId,
		});

		if (!pendingId) {
			throw new ValidationError(
				"El turno ya no está disponible. Elegí otro horario.",
			);
		}

		// Solo el id de la reserva: los datos del cliente se leen de la base en el
		// webhook. Antes se serializaban acá separados por "_", y cualquier guion
		// bajo en el nombre o el email corrompía el turno.
		const externalReference = pendingId;

		const body = {
			items: [
				{
					id: input.serviceId,
					title: `Seña de turno para ${service.title}`,
					unit_price: service.signPrice,
					quantity: 1,
					currency_id: "ARS",
					description: "Seña para un turno.",
					category_id: input.serviceId,
				},
			],
			payer: { name, email, last_name: lastName },
			back_urls: {
				success: "https://bookify.aedestec.com/processingpayment",
				failure: "https://bookify.aedestec.com/processingpayment",
				pending: "https://bookify.aedestec.com/processingpayment",
			},
			auto_return: "approved",
			external_reference: externalReference,
			notification_url: env.NOTIFICATION_URL_MP,
			statement_descriptor: "BOOKIFY TURNOS",
		};

		const data = await this.mpTokenService.withValidAccessToken(
			empresa,
			async (accessToken) => {
				const preference = await this.paymentGateway.createPreference(
					accessToken,
					body,
				);
				return {
					unauthorized: Boolean(preference.unauthorized),
					result: preference,
				};
			},
		);

		if (!data?.init_point) {
			await removePending(input.serviceId, pendingId);
			throw new Error(
				"No se pudo reservar temporalmente el turno. Inténtelo de nuevo más tarde.",
			);
		}

		return { init_point: data.init_point };
	}

	async handleOAuthCallback(code: string, state: string) {
		const data = await this.paymentGateway.exchangeOAuthCode(code);
		if (!data) {
			throw new ValidationError(
				"No se pudo obtener el access token de Mercado Pago.",
			);
		}

		const { access_token, refresh_token, user_id, expires_in } = data;
		if (!user_id) {
			throw new ValidationError(
				"Mercado Pago no devolvió el user_id de la cuenta vinculada.",
			);
		}

		const updated = await this.mpTokenService.persistTokens(
			state,
			{
				access_token,
				refresh_token,
				expires_in,
			},
			{ mp_user_id: String(user_id) },
		);

		if (!updated) {
			throw new NotFoundError("Empresa no encontrada.");
		}

		logger.info(
			{ companyId: state, mpUserId: String(user_id) },
			"Access Token obtenido.",
		);
		return `${env.FRONTEND_URL}/panel/mercadopago-success`;
	}

	async generateOAuthUrl(empresaId: string, authenticatedCompanyId: string) {
		if (String(empresaId) !== String(authenticatedCompanyId)) {
			throw new ForbiddenError(
				"No podés vincular Mercado Pago de otra empresa.",
			);
		}
		const empresa = await this.companyRepository.findById(empresaId);
		if (!empresa) throw new NotFoundError("Empresa no encontrada.");

		const subscription =
			await this.subscriptionRepository.findByCompanyId(empresaId);
		const plan = subscription?.plan || "individual";
		if (!planAllowsIntegrations(plan)) {
			throw new ForbiddenError(
				"Tu plan no incluye vinculación con Mercado Pago. Actualizá a Individual Plus o Equipo.",
			);
		}

		if (!env.CLIENT_ID_MP || !env.REDIRECT_URL_MP) {
			throw new Error("No es posible generar la URL: Faltan parámetros.");
		}
		return { url: this.paymentGateway.buildOAuthUrl(empresaId) };
	}

	async handleWebhook(body: {
		type?: string;
		action?: string;
		user_id?: string | number;
		data?: { id?: string };
	}): Promise<{ status: number; payload: Record<string, unknown> }> {
		const { type, action, user_id, data } = body;

		// created = pago nuevo; updated = p.ej. pending → approved (medios asíncronos).
		if (
			type === "payment" &&
			(action === "payment.created" || action === "payment.updated")
		) {
			logger.info({ action }, "Notificación de pago recibida.");
			if (!this.appointmentPort) {
				throw new Error("PaymentAppointmentPort no configurado");
			}
			const result =
				await this.appointmentPort.confirmFromPaymentWebhook(body);
			return { status: result.status, payload: result.body };
		}

		if (type === "mp-connect" && action === "application.deauthorized") {
			logger.info("Notificación de desautorización recibida.");
			const empresa = await this.companyRepository.findOne({
				mp_user_id: String(user_id),
			});
			if (!empresa) throw new NotFoundError("Empresa no encontrada.");

			await this.mpTokenService.clearConnection(empresa._id);

			logger.info(`Empresa ${empresa.name} desautorizada.`);
			return { status: 200, payload: { data: "Received" } };
		}

		if (type === "subscription_preapproval") {
			return this.subscriptionService.handlePreapprovalWebhook(
				data?.id as string,
			);
		}

		return {
			status: 200,
			payload: { data: "Evento recibido pero no procesado." },
		};
	}
}
