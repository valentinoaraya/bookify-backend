import mongoose, { Schema, Model } from "mongoose"
import { SubscriptionDocument } from "./subscription.types"

const SubscriptionSchema = new Schema<SubscriptionDocument>({
    companyId: {
        type: Schema.Types.ObjectId,
        ref: "Company",
        required: true,
        unique: true,
    },
    mpPreapprovalId: { type: String },
    plan: {
        type: String,
        enum: ["individual", "individual_plus", "team"],
        required: true,
    },
    pendingPlan: {
        type: String,
        enum: ["individual", "individual_plus", "team"],
    },
    status: {
        type: String,
        enum: [
            "active",
            "inactive",
            "pending",
            "upgrading",
            "downgrading",
            "cancelling",
        ],
        required: true,
        default: "pending",
    },
    startDate: { type: Date },
    nextPaymentDate: { type: String },
    previousPreapprovalId: { type: String },
    transitionStartedAt: { type: Date },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
})

SubscriptionSchema.index(
    { mpPreapprovalId: 1 },
    { unique: true, sparse: true }
)

export const SubscriptionModel: Model<SubscriptionDocument> =
    mongoose.models.Subscription ||
    mongoose.model<SubscriptionDocument>(
        "Subscription",
        SubscriptionSchema,
        "subscriptions"
    )

export default SubscriptionModel
