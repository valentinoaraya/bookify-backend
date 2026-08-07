import mongoose, { Schema, Model } from "mongoose"
import { CompanyDocument } from "./company.types"

const reminderSchema = new Schema({
    hoursBefore: { type: Number, required: true },
    services: [{ type: mongoose.Schema.Types.ObjectId, ref: "Service" }],
})

const locationSchema = new Schema({
    name: { type: String, required: true },
    province: { type: String },
    city: { type: String, required: true },
    street: { type: String, required: true },
    number: { type: String, required: true },
    isDefault: { type: Boolean, default: false },
})

const CompanySchema = new Schema<CompanyDocument>({
    name: { type: String, required: true },
    company_id: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    province: { type: String },
    city: { type: String },
    street: { type: String },
    number: { type: String },
    locations: { type: [locationSchema], default: [] },
    phone: { type: String, required: true },
    payer_email: { type: String, default: "" },
    subscriptionId: { type: mongoose.Schema.Types.ObjectId, ref: "Subscription" },
    role: { type: String, enum: ["admin", "user"], default: "user" },
    services: [{ type: mongoose.Schema.Types.ObjectId, ref: "Service" }],
    connectedWithMP: { type: Boolean, default: false },
    mp_access_token: { type: String, default: "" },
    mp_refresh_token: { type: String, default: "" },
    token_expires_in: { type: Number, default: 0 },
    mp_token_expires_at: { type: Date, default: null },
    mp_user_id: { type: String, default: "" },
    reminders: [reminderSchema],
    slotsVisibilityDays: { type: Number, required: true, default: 7 },
    cancellationAnticipationHours: { type: Number, default: 24 },
    bookingAnticipationHours: { type: Number, default: 1 },
    refresh_token: { type: String, default: "" },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
})

CompanySchema.index({ mp_user_id: 1 })

export const CompanyModel: Model<CompanyDocument> =
    mongoose.models.Company || mongoose.model<CompanyDocument>("Company", CompanySchema)

export default CompanyModel
