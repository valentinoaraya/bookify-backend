import mongoose, { Schema } from "mongoose";

const serviceInfoSchema = new Schema({
    title: { type: String, required: true }
})

const AppointmentSchema = new Schema({
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true },
    serviceId: { type: mongoose.Schema.Types.ObjectId, ref: "Service", required: true },
    name: { type: String, required: true },
    price: { type: Number, required: true },
    duration: { type: Number, required: true },
    serviceInfo: serviceInfoSchema,
    lastName: { type: String, required: true },
    email: { type: String, required: true },
    dni: { type: String, required: true },
    phone: { type: String, required: true },
    status: { type: String, enum: ["scheduled", "finished", "cancelled", "pending_action", "did_not_attend"], default: "scheduled" },
    cancelledBy: { type: String, enum: ["company", "client", "null"], default: "null" },
    date: { type: Date, required: true },
    reminderJobs: [{ type: String }],
    mode: { type: String, enum: ["in-person", "online"], default: "online" },
    paymentId: { type: String },
    totalPaidAmount: { type: Number },
    createdAt: { type: Date, default: Date.now },
    updateAt: { type: Date, default: Date.now }
})

const AppointmentModel = mongoose.model("Appointment", AppointmentSchema);

export default AppointmentModel;