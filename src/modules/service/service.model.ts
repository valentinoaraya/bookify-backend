import mongoose, { Schema, Model } from "mongoose"
import { ServiceDocument } from "./service.types"

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
})

export const ServiceModel: Model<ServiceDocument> =
    mongoose.models.Service || mongoose.model<ServiceDocument>("Service", ServiceSchema)

export default ServiceModel
