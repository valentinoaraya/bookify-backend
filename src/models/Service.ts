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

const ServiceSchema = new Schema({
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true },
    title: { type: String, required: true },
    capacityPerShift: { type: Number, default: 1 },
    description: { type: String },
    duration: { type: Number, required: true },
    price: { type: Number },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
    availableAppointments: [availableAppointment],
    scheduledAppointments: [{ type: Date, default: [] }],
    signPrice: { type: Number, default: 0 }
})

const ServiceModel = mongoose.model("Service", ServiceSchema)

export default ServiceModel