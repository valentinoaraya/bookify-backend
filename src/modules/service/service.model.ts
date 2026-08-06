import mongoose, { Schema, Model } from "mongoose"
import { ServiceDocument } from "./service.types"

const WorkScheduleBlockSchema = new Schema(
    {
        start: { type: String, required: true },
        end: { type: String, required: true },
    },
    { _id: false }
)

const WorkScheduleSchema = new Schema(
    {
        days: { type: [Number], required: true, default: [] },
        blocks: { type: [WorkScheduleBlockSchema], required: true, default: [] },
        turnIntervalMinutes: { type: Number, required: true, min: 1 },
        graceMinutes: { type: Number, required: true, min: 0, default: 0 },
    },
    { _id: false }
)

const ServiceSchema = new Schema<ServiceDocument>({
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true },
    active: { type: Boolean, required: true, default: true },
    title: { type: String, required: true },
    capacityPerShift: { type: Number, default: 1 },
    description: { type: String },
    duration: { type: Number, required: true },
    price: { type: Number },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
    mode: {
        type: String,
        enum: ["in-person", "online", "in-person-at-home"],
        default: "online",
    },
    signPrice: { type: Number, default: 0 },
    workSchedule: { type: WorkScheduleSchema, required: false },
    autoGenerateSlots: { type: Boolean, required: true, default: false },
})

export const ServiceModel: Model<ServiceDocument> =
    mongoose.models.Service || mongoose.model<ServiceDocument>("Service", ServiceSchema)

export default ServiceModel
