import mongoose, { Schema, Model } from "mongoose"
import { PaymentDocument } from "./payment.types"

const PaymentSchema = new Schema<PaymentDocument>({
    mpPaymentId: { type: String, required: true, unique: true },
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true },
    appointmentId: { type: Schema.Types.ObjectId, ref: "Appointment" },
    serviceId: { type: Schema.Types.ObjectId, ref: "Service" },
    amount: { type: Number, required: true },
    currency: { type: String, required: true, default: "ARS" },
    status: {
        type: String,
        enum: [
            "approved",
            "refunded",
            "partially_refunded",
            "refund_pending",
            "failed",
        ],
        required: true,
    },
    refundedAmount: { type: Number, required: true, default: 0 },
    idempotencyKey: { type: String },
    raw: { type: Schema.Types.Mixed },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
})

PaymentSchema.index({ companyId: 1, createdAt: -1 })
PaymentSchema.index({ appointmentId: 1 })

export const PaymentModel: Model<PaymentDocument> =
    mongoose.models.Payment ||
    mongoose.model<PaymentDocument>("Payment", PaymentSchema, "payments")

export default PaymentModel
