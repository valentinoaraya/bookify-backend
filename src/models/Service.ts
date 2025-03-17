import mongoose, { Schema } from "mongoose";

const ServiceSchema = new Schema({
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true },
    title: { type: String, required: true },
    description: { type: String },
    duration: { type: Number, required: true },
    price: { type: Number },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, defaultq: Date.now },
    availableAppointments: [{ type: Date, default: [] }],
    scheduledAppointments: [{ type: Date, default: [] }],
    signPrice: { type: Number, default: 0 }
})

const ServiceModel = mongoose.model("Service", ServiceSchema)

export default ServiceModel