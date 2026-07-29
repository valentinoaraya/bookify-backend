import mongoose, { Schema, Model } from "mongoose"
import { SlotDocument } from "./slot.types"

const SlotSchema = new Schema<SlotDocument>({
    serviceId: { type: Schema.Types.ObjectId, ref: "Service", required: true, index: true },
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true, index: true },
    datetime: { type: Date, required: true },
    capacity: { type: Number, required: true, min: 1 },
    taken: { type: Number, required: true, min: 0, default: 0 },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
})

SlotSchema.index({ serviceId: 1, datetime: 1 }, { unique: true })
SlotSchema.index({ companyId: 1, datetime: 1 })

export const SlotModel: Model<SlotDocument> =
    mongoose.models.Slot || mongoose.model<SlotDocument>("Slot", SlotSchema)

export default SlotModel
