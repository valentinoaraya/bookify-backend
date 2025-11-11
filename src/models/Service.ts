import mongoose, { Schema } from "mongoose";

const availableAppointment = new mongoose.Schema({
    datetime: {
        type: Date,
        required: true
    },
    capacity: {
        type: Number,
        required: true,
        min: 1
    },
    taken: {
        type: Number,
        required: true,
        min: 0
    }
});

const pendingAppointment = new mongoose.Schema({
    datetime: {
        type: Date,
        required: true
    },
    expiresAt: {
        type: Date,
        required: true
    },
    userId: {
        type: String,
        required: true
    }
});

const ServiceSchema = new Schema({
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true },
    active: { type: Boolean, required: true, default: true },
    title: { type: String, required: true },
    capacityPerShift: { type: Number, default: 1 },
    description: { type: String },
    duration: { type: Number, required: true },
    price: { type: Number },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
    availableAppointments: [availableAppointment],
    scheduledAppointments: [{ type: Date, default: [] }],
    pendingAppointments: [pendingAppointment],
    mode: { type: String, enum: ["in-person", "online"], default: "online" },
    signPrice: { type: Number, default: 0 }
})

const ServiceModel = mongoose.model("Service", ServiceSchema)

export default ServiceModel