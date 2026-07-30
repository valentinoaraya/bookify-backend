import { ClientSession, Types } from "mongoose"
import { BaseRepository } from "../../shared/base/base.repository"
import { refundStatusForAmount } from "./refund-policy"
import PaymentModel from "./payment.model"
import {
    CreateIfAbsentResult,
    PaymentDocument,
    PaymentInput,
    PaymentStatus,
} from "./payment.types"

type SessionOpts = { session?: ClientSession | null }

function isDuplicateKeyError(error: unknown): boolean {
    return (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code?: number }).code === 11000
    )
}

export class PaymentRepository extends BaseRepository<PaymentDocument> {
    constructor() {
        super(PaymentModel)
    }

    async findByMpPaymentId(mpPaymentId: string): Promise<PaymentDocument | null> {
        return this.findOne({ mpPaymentId }, true)
    }

    async findByStatus(status: PaymentStatus): Promise<PaymentDocument[]> {
        return this.find({ status }, true)
    }

    /**
     * Inserta un pago si no existe (idempotente vía unique mpPaymentId).
     * Si gana el insert → created: true; si hay duplicate key → created: false.
     */
    async createIfAbsent(data: PaymentInput): Promise<CreateIfAbsentResult> {
        try {
            const payment = await this.create({
                mpPaymentId: data.mpPaymentId,
                companyId: new Types.ObjectId(String(data.companyId)),
                appointmentId: data.appointmentId
                    ? new Types.ObjectId(String(data.appointmentId))
                    : undefined,
                serviceId: data.serviceId
                    ? new Types.ObjectId(String(data.serviceId))
                    : undefined,
                amount: data.amount,
                currency: data.currency ?? "ARS",
                status: data.status,
                refundedAmount: data.refundedAmount ?? 0,
                idempotencyKey: data.idempotencyKey,
                raw: data.raw,
                createdAt: new Date(),
                updatedAt: new Date(),
            } as Partial<PaymentDocument>)

            return { created: true, payment }
        } catch (error) {
            if (isDuplicateKeyError(error)) {
                const existing = await this.findByMpPaymentId(data.mpPaymentId)
                if (existing) {
                    return { created: false, payment: existing }
                }
            }
            throw error
        }
    }

    async linkAppointment(
        paymentId: string | Types.ObjectId,
        appointmentId: string | Types.ObjectId,
        opts: SessionOpts = {}
    ): Promise<PaymentDocument | null> {
        return this.model
            .findByIdAndUpdate(
                paymentId,
                {
                    $set: {
                        appointmentId: new Types.ObjectId(String(appointmentId)),
                        updatedAt: new Date(),
                    },
                },
                { new: true, session: opts.session ?? undefined }
            )
            .exec()
    }

    async updateStatus(
        paymentId: string | Types.ObjectId,
        status: PaymentStatus,
        refundedAmount?: number,
        opts: SessionOpts = {}
    ): Promise<PaymentDocument | null> {
        const $set: Record<string, unknown> = { status, updatedAt: new Date() }
        if (refundedAmount !== undefined) {
            $set.refundedAmount = refundedAmount
        }
        return this.model
            .findByIdAndUpdate(paymentId, { $set }, {
                new: true,
                session: opts.session ?? undefined,
            })
            .exec()
    }

    async markRefunded(
        paymentId: string | Types.ObjectId,
        refundedAmount: number,
        opts: SessionOpts = {}
    ): Promise<PaymentDocument | null> {
        const payment = await this.model
            .findById(paymentId)
            .session(opts.session ?? null)
            .exec()
        if (!payment) return null

        const status = refundStatusForAmount(payment.amount, refundedAmount)
        return this.updateStatus(paymentId, status, refundedAmount, opts)
    }
}
