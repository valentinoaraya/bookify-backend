import moment from "moment-timezone";
import { ClientSession, Types } from "mongoose";
import { getIO } from "../../infrastructure/realtime/socket";
import { reminderQueue } from "../../queues/reminderQueue";
import { withTransaction } from "../../shared/database/withTransaction";
import { logger } from "../../shared/logger";
import { escapeRegex } from "../../shared/utils/regex";
import {
	ForbiddenError,
	NotFoundError,
	UnauthorizedError,
	ValidationError,
} from "../../shared/errors";
import {
	BA_TIMEZONE,
	formatDateOnly,
	formatDateTime,
	nowBaTz,
	parseBaTz,
} from "../../shared/utils/datetime";
import { formatDate } from "../../utils/formatDate";
import { scheduleRemindersForAppointment } from "../../utils/scheduleRemindersForAppointment";
import { CompanyRepository } from "../company/company.repository";
import { NotificationService } from "../notification/notification.service";
import {
	MercadoPagoPaymentGateway,
	RefundPort,
} from "../payment/refund.gateway";
import { MpTokenService } from "../payment/mp-token.service";
import { calculateRefundAmount, RefundActor } from "../payment/refund-policy";
import { PaymentRepository } from "../payment/payment.repository";
import { CompanyDocument } from "../company/company.types";
import { ServiceMapper } from "../service/service.mapper";
import { ServiceRepository } from "../service/service.repository";
import { ServiceDocument } from "../service/service.types";
import { SlotRepository } from "../slot/slot.repository";
import { PendingReservationService } from "../pending-reservation/pending-reservation.service";
import { AppointmentMapper } from "./appointment.mapper";
import { AppointmentRepository } from "./appointment.repository";
import { AppointmentRef, signCancelToken } from "./cancel-token";
import {
	buildLocationsFromLegacy,
	formatLocationAddress,
	resolveBookingLocation,
	toLocationSnapshot,
} from "../company/location.utils";
import {
	AppointmentDocument,
	AppointmentUserData,
	ChangeStatusInput,
	CheckOrderTimeInput,
	CompanyHistoryQuery,
	ConfirmAppointmentInput,
	DeleteByCompanyResult,
	PaymentWebhookBody,
} from "./appointment.types";
import {
	assertBookable,
	assertBookingAnticipation,
	checkBookable,
	formatAnticipationMessage,
} from "./booking-rules";

type PaymentGateway = RefundPort &
	Pick<
		MercadoPagoPaymentGateway,
		"getPayment" | "getPaymentDetailed" | "refundDetailed"
	>;

type CreateAppointmentOptions = {
	paymentId?: string;
	totalPaidAmount?: number;
	paymentRef?: Types.ObjectId | string;
	pendingId?: string;
	locationId?: string;
};

export class AppointmentService {
	constructor(
		private readonly appointmentRepository: AppointmentRepository,
		private readonly serviceRepository: ServiceRepository,
		private readonly companyRepository: CompanyRepository,
		private readonly notificationService: NotificationService,
		private readonly pendingSlotService: PendingReservationService,
		private readonly paymentGateway: PaymentGateway,
		private readonly slotRepository: SlotRepository,
		private readonly paymentRepository: PaymentRepository,
		private readonly mpTokenService: MpTokenService,
	) {}

	private async refundWithTokenRetry(
		company: CompanyDocument,
		paymentId: string,
		amount: number,
	): Promise<unknown | null> {
		return this.mpTokenService.withValidAccessToken(
			company,
			async (accessToken) => {
				const result = await this.paymentGateway.refundDetailed(
					paymentId,
					accessToken,
					amount,
				);
				return {
					unauthorized: result.unauthorized,
					result: result.ok ? result.data : null,
				};
			},
		);
	}

	async createAppointment(
		companyId: string,
		serviceId: string,
		date: Date,
		dataUser: AppointmentUserData,
		paymentIdOrOpts?: string | CreateAppointmentOptions,
		totalPaidAmount?: number,
		paymentRef?: Types.ObjectId | string,
	) {
		const opts: CreateAppointmentOptions =
			typeof paymentIdOrOpts === "object" && paymentIdOrOpts !== null
				? paymentIdOrOpts
				: {
						paymentId: paymentIdOrOpts,
						totalPaidAmount,
						paymentRef,
					};

		const service = await this.serviceRepository.findLeanById(serviceId);
		const company = await this.companyRepository.findById(companyId);

		if (!company || !service) {
			throw new ValidationError(
				"Error al obtener empresa, servicio o usuario.",
			);
		}
		if (String(service.companyId) !== String(companyId)) {
			throw new ValidationError(
				"Error al obtener empresa, servicio o usuario.",
			);
		}

		if ((service.signPrice ?? 0) > 0 && !opts.paymentRef) {
			throw new ValidationError(
				"Este servicio requiere el pago de una seña para reservar el turno.",
			);
		}

		assertBookable(service, date);

		// Reserva directa (sin seña): hay que respetar las reservas temporales de
		// quienes están pagando en Mercado Pago en este momento. En el flujo del
		// webhook la disponibilidad ya se validó excluyendo el pending propio.
		if (!opts.pendingId) {
			const available = await this.pendingSlotService.isAvailable(
				String(serviceId),
				date,
			);
			if (!available) {
				throw new ValidationError("Turno no disponible.");
			}
		}

		const price = service.price ?? 0;
		const mode = service.mode;
		const duration = service.duration;

		const companyLocations = company.locations?.length
			? company.locations
			: buildLocationsFromLegacy(company) || [];

		const location =
			mode === "in-person"
				? resolveBookingLocation({
						locations: companyLocations,
						serviceLocationIds: service.locationIds,
						locationId: opts.locationId,
						mode,
					})
				: null;

		if (mode === "in-person") {
			const allowedCount = (service.locationIds || []).length;
			const needsExplicitChoice = allowedCount > 1;
			if (needsExplicitChoice && !opts.locationId) {
				throw new ValidationError("Seleccioná una sede para el turno.");
			}
			if (opts.locationId && !location) {
				throw new ValidationError(
					"La sede seleccionada no es válida para este servicio.",
				);
			}
		}

		const locationSnapshot = location
			? toLocationSnapshot(location)
			: undefined;
		const companyAddress = location
			? formatLocationAddress(location)
			: `${company.street ?? ""} ${company.number ?? ""}, ${company.city ?? ""}`.trim();

		const { savedAppointment, pendingRemoved } = await withTransaction(
			async (session) => {
				const reservedSlot =
					await this.slotRepository.tryReserveByServiceDatetime(
						serviceId,
						date,
						{ session: session ?? undefined },
					);
				if (!reservedSlot) {
					throw new ValidationError("Turno no disponible.");
				}

				const {
					// Evitar persistir campos que no pertenecen al appointment
					userLocation,
					name,
					lastName,
					email,
					phone,
					dni,
					...restUser
				} = dataUser as AppointmentUserData & Record<string, unknown>;

				void restUser;

				const saved =
					await this.appointmentRepository.createWithSession(
						{
							companyId: new Types.ObjectId(companyId),
							serviceId: new Types.ObjectId(serviceId),
							slotId: reservedSlot._id,
							date,
							paymentId: opts.paymentId ?? null,
							paymentRef: opts.paymentRef
								? new Types.ObjectId(String(opts.paymentRef))
								: undefined,
							totalPaidAmount: opts.totalPaidAmount,
							name,
							lastName,
							email,
							phone,
							dni,
							userLocation,
							location: locationSnapshot,
							price,
							mode,
							duration,
						} as Partial<AppointmentDocument>,
						{ session },
					);

				if (opts.paymentRef) {
					await this.paymentRepository.linkAppointment(
						opts.paymentRef,
						saved._id,
						{ session },
					);
				}

				let removed = false;
				if (opts.pendingId) {
					const pending = await this.pendingSlotService.deletePending(
						serviceId,
						opts.pendingId,
						{ session },
					);
					removed = Boolean(pending);
				}

				return { savedAppointment: saved, pendingRemoved: removed };
			},
		);

		// Side-effects solo después del commit
		const appointmentToSend =
			await this.appointmentRepository.findLeanByIdPopulated(
				savedAppointment._id,
			);

		const dateInString = formatDateTime(date);
		const serviceToSend = await this.buildServiceWithSlots(
			serviceId,
			service,
		);
		const [dateLabel, timeLabel] = dateInString.split(" ");

		await this.notificationService.sendConfirmAppointment({
			userEmail: dataUser.email,
			userName: `${dataUser.name} ${dataUser.lastName}`,
			companyEmail: company.email,
			companyName: company.name,
			companyAddress:
				mode === "in-person-at-home" && dataUser.userLocation
					? dataUser.userLocation
					: companyAddress,
			serviceTitle: service.title,
			dateLabel: formatDate(dateLabel),
			timeLabel,
			cancelToken: signCancelToken(savedAppointment._id, date),
			mode,
		});

		await scheduleRemindersForAppointment(savedAppointment._id.toString());

		if (opts.pendingId) {
			await this.pendingSlotService.notifyServiceUpdated(serviceId);
			if (pendingRemoved) {
				console.log(
					`✅ Turno confirmado para ${dataUser.email} y removido de pending_reservations`,
				);
			} else {
				console.log(
					`⚠️ Turno confirmado para ${dataUser.email} pero no se pudo remover de pending_reservations`,
				);
			}
		}

		return AppointmentMapper.toConfirmResponse(
			{
				...appointmentToSend,
				date: savedAppointment.date,
			} as Record<string, any>,
			serviceToSend as Record<string, any> | null,
			String(serviceId),
		);
	}

	async confirmAppointment(
		input: ConfirmAppointmentInput,
		userData: AppointmentUserData,
	) {
		const newDate = parseBaTz(input.date);

		const company = await this.companyRepository.findById(input.companyId);
		if (!company) throw new NotFoundError("No se encontró la empresa.");
		assertBookingAnticipation(company, newDate);

		const appointment = await this.createAppointment(
			input.companyId,
			input.serviceId,
			newDate,
			userData,
			{ locationId: input.locationId },
		);

		if (!appointment) {
			throw new ValidationError("No se pudo crear el turno.");
		}

		getIO()
			.to(String(appointment.companyId))
			.emit("company:appointment-added", appointment);

		return appointment;
	}

	/**
	 * Lógica del webhook de Mercado Pago (payment.created).
	 * Idempotente vía payments.mpPaymentId unique + createIfAbsent.
	 */
	async confirmFromPaymentWebhook(body: PaymentWebhookBody): Promise<{
		status: number;
		body: { data?: string; error?: string };
	}> {
		const { type, action, data, user_id } = body;

		const isPaymentEvent =
			type === "payment" &&
			(action === "payment.created" || action === "payment.updated");
		if (!isPaymentEvent) {
			return {
				status: 200,
				body: { data: "Evento recibido pero no procesado." },
			};
		}

		const paymentId = String(data?.id ?? "");
		const company = await this.companyRepository.findOne({
			mp_user_id: String(user_id),
		});

		if (!company) {
			return {
				status: 500,
				body: { error: "No se encontró la empresa." },
			};
		}

		const paymentInfo = await this.mpTokenService.withValidAccessToken(
			company,
			async (accessToken) => {
				const result = await this.paymentGateway.getPaymentDetailed(
					paymentId,
					accessToken,
				);
				return {
					unauthorized: result.unauthorized,
					result: result.ok ? result.data : null,
				};
			},
		);

		if (!paymentInfo || paymentInfo.status !== "approved") {
			return { status: 200, body: { error: "El pago no fué aprobado." } };
		}

		const totalPaidAmount =
			paymentInfo.transaction_details?.total_paid_amount ?? 0;

		const reference = await this.resolveWebhookReference(
			String(paymentInfo.external_reference),
		);
		if (!reference) {
			return {
				status: 500,
				body: {
					error: "No se pudo interpretar la referencia del pago.",
				},
			};
		}

		const { companyId, serviceId, dataUser, pendingId, locationId } =
			reference;
		const newDate = reference.date;

		const paymentRecord = await this.paymentRepository.createIfAbsent({
			mpPaymentId: paymentId,
			companyId: company._id,
			serviceId,
			amount: totalPaidAmount,
			currency: "ARS",
			status: "approved",
			raw: paymentInfo as unknown as Record<string, unknown>,
		});

		// Webhook duplicado con turno ya vinculado, o pago ya reembolsado/en cola.
		if (!paymentRecord.created) {
			const existing = paymentRecord.payment;
			const alreadySettled =
				Boolean(existing.appointmentId) ||
				existing.status !== "approved";
			if (alreadySettled) {
				return { status: 200, body: { data: "Pago ya procesado." } };
			}
			// Limbo: pago insertado pero el turno nunca se creó (crash/falla
			// entre createIfAbsent y createAppointment). Reembolsamos.
			logger.warn(
				{ paymentId, email: dataUser.email },
				"Pago approved sin appointment — recuperando con reembolso",
			);
			return this.refundUnavailableAfterPayment({
				paymentId,
				paymentDocId: existing._id,
				company,
				totalPaidAmount: existing.amount,
				dataUser,
				companyName: company.name,
				serviceId,
				date: newDate,
			});
		}

		const userId = `${dataUser.name}_${dataUser.lastName}_${dataUser.email}`;
		const isAvailable = await this.pendingSlotService.isAvailable(
			serviceId,
			newDate,
			userId,
		);

		// El servicio puede haberse desactivado o el horario haber pasado entre
		// el checkout y la llegada del webhook: se reembolsa igual que si el
		// turno estuviese ocupado, en lugar de fallar con el pago ya cobrado.
		const serviceForCheck =
			await this.serviceRepository.findLeanById(serviceId);
		const bookable = serviceForCheck
			? checkBookable(serviceForCheck, newDate)
			: { ok: false as const, reason: "Servicio no encontrado." };

		if (!isAvailable || !bookable.ok) {
			return this.refundUnavailableAfterPayment({
				paymentId,
				paymentDocId: paymentRecord.payment._id,
				company,
				totalPaidAmount,
				dataUser,
				companyName: company.name,
				serviceId,
				serviceTitle: serviceForCheck?.title,
				date: newDate,
			});
		}

		try {
			const appointment = await this.createAppointment(
				companyId,
				serviceId,
				newDate,
				dataUser,
				{
					paymentId,
					totalPaidAmount,
					paymentRef: paymentRecord.payment._id,
					pendingId,
					locationId,
				},
			);

			if (!appointment) {
				throw new Error("createAppointment devolvió null");
			}

			getIO()
				.to(String(appointment.companyId))
				.emit("company:appointment-added", appointment);

			return {
				status: 200,
				body: { data: "Pago procesado y turno confirmado." },
			};
		} catch (error) {
			// Si el commit ya vinculó el appointment, el fallo fue post-commit
			// (mail/reminders): no reembolsar. Solo reembolsar el limbo real.
			const linked = await this.paymentRepository.findById(
				paymentRecord.payment._id,
				true,
			);
			if (linked?.appointmentId) {
				logger.error(
					{ err: error, paymentId, email: dataUser.email },
					"Turno creado pero falló side-effect post-commit",
				);
				return {
					status: 200,
					body: { data: "Pago procesado y turno confirmado." },
				};
			}

			logger.error(
				{ err: error, paymentId, email: dataUser.email },
				"Fallo al crear turno tras pago aprobado — reembolsando",
			);
			return this.refundUnavailableAfterPayment({
				paymentId,
				paymentDocId: paymentRecord.payment._id,
				company,
				totalPaidAmount,
				dataUser,
				companyName: company.name,
				serviceId,
				serviceTitle: serviceForCheck?.title,
				date: newDate,
			});
		}
	}

	/**
	 * Reembolso 100% cuando el pago quedó aprobado pero el turno no se puede
	 * (o no se pudo) confirmar. Si MP falla, deja refund_pending para el cron.
	 */
	private async refundUnavailableAfterPayment(input: {
		paymentId: string;
		paymentDocId: Types.ObjectId;
		company: CompanyDocument;
		totalPaidAmount: number;
		dataUser: AppointmentUserData;
		companyName: string;
		serviceId: string;
		serviceTitle?: string;
		date: Date;
	}): Promise<{ status: number; body: { data?: string; error?: string } }> {
		const {
			paymentId,
			paymentDocId,
			company,
			totalPaidAmount,
			dataUser,
			companyName,
			serviceId,
			date,
		} = input;

		let serviceTitle = input.serviceTitle;
		if (!serviceTitle) {
			const service =
				await this.serviceRepository.findLeanById(serviceId);
			serviceTitle = service?.title;
		}

		console.log(
			`⚠️  Turno no disponible para ${dataUser.email}. Procesando reembolso...`,
		);

		const refundAmount = calculateRefundAmount(
			totalPaidAmount,
			"system_unavailable",
		);
		const refundResponse = await this.refundWithTokenRetry(
			company,
			paymentId,
			refundAmount,
		);

		if (!refundResponse) {
			console.error(
				`❌ Error al procesar reembolso para ${dataUser.email}`,
			);
			await this.paymentRepository.updateStatus(
				paymentDocId,
				"refund_pending",
				0,
			);
			return {
				status: 500,
				body: {
					error: "Error al procesar reembolso. Contactar al soporte.",
				},
			};
		}

		await this.paymentRepository.markRefunded(paymentDocId, refundAmount);
		console.log(`✅ Reembolso procesado para ${dataUser.email}`);

		await this.notificationService.sendRefundUnavailable({
			userEmail: dataUser.email,
			userName: dataUser.name,
			companyName,
			serviceTitle: serviceTitle as string,
			dateLabel: formatDate(formatDateOnly(date)),
			timeLabel: moment(date).tz(BA_TIMEZONE).format("HH:mm"),
		});

		return {
			status: 200,
			body: {
				data: "Pago aprobado pero turno no disponible. Reembolso procesado.",
			},
		};
	}

	async checkOrderTime(input: CheckOrderTimeInput): Promise<"available"> {
		const company = await this.companyRepository.findById(input.companyId);
		if (!company) throw new NotFoundError("No se encontró la empresa.");

		assertBookingAnticipation(company, new Date(input.date));

		return "available";
	}

	async cancelByClient(ref: AppointmentRef, providedEmail?: string) {
		const id = ref.appointmentId;
		const appointment = await this.appointmentRepository.findLeanById(id);
		if (!appointment) throw new ValidationError("No se encontró el turno.");

		// Los links viejos llevan el id sin firmar: exigimos el email del turno
		// como prueba de identidad. Con token firmado ya está probada.
		if (!ref.verified && !sameEmail(providedEmail, appointment.email)) {
			throw new UnauthorizedError(
				"El email no coincide con el del turno. Revisá el correo de confirmación.",
			);
		}

		const company = await this.companyRepository.findById(
			appointment.companyId,
		);
		if (!company) throw new ValidationError("Empresa no encontrada.");

		const now = moment();
		const appointmentDate = moment(appointment.date);
		const diffHours = appointmentDate.diff(now, "hours");
		const messageHours = formatAnticipationMessage(
			company.cancellationAnticipationHours,
		);

		if (diffHours < company.cancellationAnticipationHours) {
			throw new ValidationError(
				`No es posible cancelar el turno con menos de ${messageHours} de anticipación.`,
			);
		}

		const service = await this.serviceRepository.findLeanById(
			appointment.serviceId,
		);
		if (!service) throw new ValidationError("Servicio no encontrado.");

		const { serviceToSend } = await this.executeCancellation(
			appointment,
			company,
			service,
			"client",
		);

		const dateInString = formatDateTime(appointment.date);

		getIO()
			.to(company._id.toString())
			.emit("company:appointment-deleted", {
				serviceId: String(appointment.serviceId),
				appointment: {
					...appointment,
					date: dateInString,
				},
				service: AppointmentMapper.formatServiceForSocket(
					serviceToSend as Record<string, any>,
				),
			});

		const [dateLabel, timeLabel] = dateInString.split(" ");
		await this.notificationService.sendCancelByClient({
			userEmail: appointment.email,
			userName: appointment.name,
			companyEmail: company.email,
			companyName: company.name,
			serviceTitle: service.title,
			dateLabel: formatDate(dateLabel),
			timeLabel,
		});

		return { serviceToSend };
	}

	async deleteByCompany(
		appointmentId: string,
		companyId: string,
		companyName: string,
		companyEmail: string,
	): Promise<DeleteByCompanyResult> {
		const appointment =
			await this.appointmentRepository.findLeanById(appointmentId);
		if (!appointment) throw new NotFoundError("Turno no encontrado.");

		this.assertBelongsToCompany(appointment, companyId);

		const service = await this.serviceRepository.findLeanById(
			appointment.serviceId,
		);
		if (!service) throw new NotFoundError("Servicio no encontrado.");

		const company = await this.companyRepository.findById(
			appointment.companyId,
		);
		if (!company) throw new NotFoundError("Empresa no encontrada.");

		const { serviceToSend } = await this.executeCancellation(
			appointment,
			company,
			service,
			"company",
		);

		const dateInString = formatDateTime(appointment.date);
		const [dateLabel, timeLabel] = dateInString.split(" ");

		await this.notificationService.sendCancelByCompany({
			userEmail: appointment.email as string,
			userName: `${appointment.name} ${appointment.lastName}`,
			companyEmail,
			companyName,
			serviceTitle: service.title,
			dateLabel: formatDate(dateLabel),
			timeLabel,
		});

		return {
			serviceToSend: serviceToSend as Record<string, any> | null,
			appointment: appointment as unknown as Record<string, any>,
			dateInString,
		};
	}

	async getByRef(ref: AppointmentRef) {
		const appointment = await this.appointmentRepository.findLeanById(
			ref.appointmentId,
		);
		if (!appointment) throw new ValidationError("No se encontró el turno.");

		const service = await this.serviceRepository.findById(
			appointment.serviceId,
		);
		const company = await this.companyRepository.findById(
			appointment.companyId,
		);

		if (!service || !company) {
			throw new ValidationError(
				"Error al obtener empresa, servicio o usuario.",
			);
		}

		return AppointmentMapper.toDetailResponse(
			appointment,
			service,
			company,
			ref.verified,
		);
	}

	async getCompanyHistory(companyId: string, query: CompanyHistoryQuery) {
		const page = Number(query.page ?? 1);
		const limit = Number(query.limit ?? 10);
		const { from, to, q, serviceId } = query;

		const filters: Record<string, unknown> = {
			companyId,
			status: { $ne: "scheduled" },
		};

		if (from && to) {
			const startDate = moment
				.tz(`${from}`, "YYYY-MM-DD", BA_TIMEZONE)
				.toDate();
			const endDate = moment
				.tz(`${to}`, "YYYY-MM-DD", BA_TIMEZONE)
				.toDate();
			filters.date = { $gte: startDate, $lte: endDate };
		}

		if (serviceId && typeof serviceId === "string" && serviceId !== "all") {
			filters.serviceId = new Types.ObjectId(serviceId);
		}

		if (q && typeof q === "string" && q.trim() !== "") {
			const search = q.trim();
			const tokens = search.split(/\s+/).filter(Boolean);

			const nameLastNameAndConditions = {
				$and: tokens.map((t: string) => ({
					$or: [
						{ name: { $regex: escapeRegex(t), $options: "i" } },
						{ lastName: { $regex: escapeRegex(t), $options: "i" } },
					],
				})),
			};

			const orConditions: any[] = [
				nameLastNameAndConditions,
				{ email: { $regex: escapeRegex(search), $options: "i" } },
			];

			const dniNumber = Number(search);
			if (!isNaN(dniNumber)) {
				orConditions.push({ dni: dniNumber });
			}

			filters.$or = orConditions;
		}

		const skip = (page - 1) * limit;

		const [appointments, total, pendingAppointments] = await Promise.all([
			this.appointmentRepository.findHistoryPage(
				filters as any,
				skip,
				limit,
			),
			this.appointmentRepository.count(filters as any),
			this.appointmentRepository.findPendingActionByCompany(companyId),
		]);

		const hasMore = total > skip + appointments.length;

		const formattedAppointments = (appointments as any[])
			.map((appointment) => AppointmentMapper.toHistoryItem(appointment))
			.filter((appointment) => appointment !== null);

		const formattedPendingAppointments = (pendingAppointments as any[])
			.map((appointment) =>
				AppointmentMapper.toPendingHistoryItem(appointment),
			)
			.filter((appointment) => appointment !== null);

		const nowTz = nowBaTz();
		const startOfMonth = nowTz.clone().startOf("month").toDate();
		const endOfMonth = nowTz.clone().endOf("month").toDate();

		const [finishedThisMonth, totalAppointmentsThisMonth, popularService] =
			await Promise.all([
				this.appointmentRepository.findInDateRange(
					companyId,
					startOfMonth,
					endOfMonth,
					{ status: { $ne: "scheduled" } },
				),
				this.appointmentRepository.countInDateRange(
					companyId,
					startOfMonth,
					endOfMonth,
				),
				this.appointmentRepository.findMostPopularService(companyId),
			]);

		const totalIncome = (finishedThisMonth as any[]).reduce(
			(acc, appt: any) => {
				let price = 0;
				if (appt.status === "finished") {
					price = (appt?.price || 0) + (appt?.totalPaidAmount || 0);
				} else if (appt.status === "did_not_attend") {
					price = appt?.totalPaidAmount || 0;
				} else if (
					appt.status === "cancelled" &&
					appt.cancelledBy === "company"
				) {
					price = 0;
				} else if (
					appt.status === "cancelled" &&
					appt.cancelledBy === "client"
				) {
					price = appt?.totalPaidAmount
						? appt.totalPaidAmount * 0.5
						: 0;
				}
				return acc + (typeof price === "number" ? price : 0);
			},
			0,
		);

		const finishedAppointmentsCount = (finishedThisMonth as any[]).filter(
			(appt: any) => appt.status === "finished",
		).length;
		const finishedAppointmentsPercentage =
			totalAppointmentsThisMonth > 0
				? (finishedAppointmentsCount / totalAppointmentsThisMonth) * 100
				: 0;

		return {
			data: formattedAppointments,
			pendingAppointments: formattedPendingAppointments,
			hasMore,
			total,
			totalPages: Math.ceil(total / limit),
			currentPage: page,
			stats: {
				totalIncome,
				totalAppointments: totalAppointmentsThisMonth,
				mostPopularService: popularService?.title ?? "N/A",
				finishedAppointmentsPercentage,
			},
		};
	}

	async finish(id: string, companyId: string) {
		return this.applyClosingStatus(id, companyId, "finished");
	}

	async changeStatus(input: ChangeStatusInput, companyId: string) {
		if (input.status !== "finished" && input.status !== "did_not_attend") {
			throw new ValidationError("Estado no aceptado.");
		}

		return this.applyClosingStatus(
			input.appointmentId,
			companyId,
			input.status,
		);
	}

	/**
	 * Cierra un turno (asistió / no asistió). Solo desde `scheduled` o
	 * `pending_action`: un turno cancelado no puede volver a abrirse.
	 */
	private async applyClosingStatus(
		appointmentId: string,
		companyId: string,
		status: "finished" | "did_not_attend",
	) {
		const appointment =
			await this.appointmentRepository.findLeanById(appointmentId);
		if (!appointment) throw new NotFoundError("Turno no encontrado.");

		this.assertBelongsToCompany(appointment, companyId);

		if (
			appointment.status !== "scheduled" &&
			appointment.status !== "pending_action"
		) {
			throw new ValidationError(
				`No es posible cambiar el estado de un turno ${appointment.status}.`,
			);
		}

		const appointmentUpdated = await this.appointmentRepository.updateById(
			appointmentId,
			{ $set: { status, reminderJobs: [] } },
			true,
		);

		if (!appointmentUpdated) {
			throw new ValidationError("No se pudo actualizar el turno.");
		}

		await this.removeRemindersJobs(appointment.reminderJobs || []);

		return appointmentUpdated;
	}

	/**
	 * Resuelve la referencia externa de Mercado Pago.
	 * Formato actual: el id de la reserva temporal, con los datos del cliente en
	 * base. Formato anterior: nueve campos unidos por "_", que se rompía si
	 * alguno los contenía; se mantiene como fallback para pagos en vuelo.
	 */
	private async resolveWebhookReference(raw: string): Promise<{
		companyId: string;
		serviceId: string;
		date: Date;
		dataUser: AppointmentUserData;
		pendingId?: string;
		locationId?: string;
	} | null> {
		const pending = await this.pendingSlotService.getById(raw);
		if (pending?.userData) {
			const slot = await this.slotRepository.findById(
				String(pending.slotId),
				true,
			);
			if (!slot) return null;

			return {
				companyId: String(pending.companyId),
				serviceId: String(pending.serviceId),
				date: slot.datetime,
				dataUser: {
					name: pending.userData.name,
					lastName: pending.userData.lastName,
					email: pending.userData.email,
					dni: pending.userData.dni,
					phone: pending.userData.phone,
					userLocation: pending.userData.userLocation,
				},
				pendingId: String(pending._id),
				locationId: pending.userData.locationId,
			};
		}

		const parts = raw.split("_");
		if (parts.length < 8) return null;

		return {
			companyId: parts[0],
			serviceId: parts[1],
			date: parseBaTz(parts[2]),
			dataUser: {
				name: parts[3],
				lastName: parts[4],
				email: parts[5],
				dni: parts[6],
				phone: parts[7],
			},
			pendingId: parts[8],
		};
	}

	private assertBelongsToCompany(
		appointment: Pick<AppointmentDocument, "companyId">,
		companyId: string,
	): void {
		if (String(appointment.companyId) !== String(companyId)) {
			throw new ForbiddenError("El turno no pertenece a esta empresa.");
		}
	}

	async findScheduledIdsByService(
		serviceId: string,
	): Promise<Array<{ id: string; _id: Types.ObjectId }>> {
		const appointments =
			await this.appointmentRepository.findScheduledByService(serviceId);
		return appointments.map((app) => ({
			id: app.id,
			_id: app._id,
		}));
	}

	async snapshotServiceInfo(serviceId: string, title: string): Promise<void> {
		await this.appointmentRepository.setServiceInfoSnapshot(
			serviceId,
			title,
		);
	}

	/**
	 * Cancela el turno y libera el horario en una transacción, y recién después
	 * pide el reembolso a Mercado Pago. Si el reembolso falla, el pago queda en
	 * `refund_pending` para que el cron lo reintente: es preferible a devolver el
	 * dinero y dejar el turno ocupado, que era el comportamiento anterior.
	 */
	private async executeCancellation(
		appointment: AppointmentDocument,
		company: CompanyDocument,
		service: ServiceDocument,
		actor: "client" | "company",
	): Promise<{
		serviceToSend: Record<string, any> | null;
		refundAmount: number | null;
	}> {
		const serviceToSend = await withTransaction(async (session) => {
			const cancelled =
				await this.appointmentRepository.cancelIfScheduled(
					appointment._id,
					actor,
					{ session },
				);
			if (!cancelled) {
				throw new ValidationError(
					"El turno ya no se encuentra agendado.",
				);
			}

			return this.releaseSlotInSession(appointment, service, session);
		});

		await this.removeRemindersJobs(appointment.reminderJobs || []);

		const refundAmount = await this.refundAfterCancellation(
			appointment,
			company,
			actor,
		);

		return { serviceToSend, refundAmount };
	}

	private async refundAfterCancellation(
		appointment: Pick<
			AppointmentDocument,
			"paymentId" | "paymentRef" | "totalPaidAmount" | "email"
		>,
		company: CompanyDocument,
		actor: RefundActor,
	): Promise<number | null> {
		if (!appointment.paymentId || !appointment.totalPaidAmount) {
			return null;
		}

		const amount = calculateRefundAmount(
			appointment.totalPaidAmount,
			actor,
		);
		const payment = await this.resolvePayment(appointment);

		const refundResponse = await this.refundWithTokenRetry(
			company,
			String(appointment.paymentId),
			amount,
		);

		if (!refundResponse) {
			logger.error(
				{ paymentId: appointment.paymentId, amount },
				"Reembolso rechazado por Mercado Pago: queda pendiente de reintento",
			);
			if (payment) {
				await this.paymentRepository.updateStatus(
					payment._id,
					"refund_pending",
				);
			}
			return null;
		}

		if (payment) {
			await this.paymentRepository.markRefunded(payment._id, amount);
		}
		return amount;
	}

	private async resolvePayment(
		appointment: Pick<AppointmentDocument, "paymentId" | "paymentRef">,
	) {
		if (appointment.paymentRef) {
			return this.paymentRepository.findById(appointment.paymentRef);
		}
		if (appointment.paymentId) {
			return this.paymentRepository.findByMpPaymentId(
				String(appointment.paymentId),
			);
		}
		return null;
	}

	private async releaseSlotInSession(
		appointment: Pick<AppointmentDocument, "serviceId" | "date" | "slotId">,
		service: ServiceDocument,
		session: ClientSession | null,
	): Promise<Record<string, any> | null> {
		let released = null;
		const opts = { session: session ?? undefined };
		if (appointment.slotId) {
			released = await this.slotRepository.releaseOne(
				appointment.slotId,
				opts,
			);
		} else {
			released = await this.slotRepository.releaseByServiceDatetime(
				appointment.serviceId,
				appointment.date,
				opts,
			);
		}

		if (!released) {
			throw new ValidationError("Turno no encontrado en 'agendados'");
		}

		return this.buildServiceWithSlots(appointment.serviceId, service);
	}

	private async removeRemindersJobs(remindersJobs: string[]): Promise<void> {
		for (const jobId of remindersJobs) {
			const job = await reminderQueue.getJob(jobId);
			if (job) {
				await job.remove();
				console.log(`🗑 Job ${jobId} eliminado`);
			}
		}
	}

	private async buildServiceWithSlots(
		serviceId: string | Types.ObjectId,
		service?: ServiceDocument | Record<string, any> | null,
	): Promise<Record<string, any> | null> {
		const base =
			service ?? (await this.serviceRepository.findLeanById(serviceId));
		if (!base) return null;
		const slots = await this.slotRepository.findAllByService(serviceId);
		return ServiceMapper.withSlots(base, slots);
	}
}

function sameEmail(a?: string, b?: string): boolean {
	if (!a || !b) return false;
	return a.trim().toLowerCase() === String(b).trim().toLowerCase();
}
