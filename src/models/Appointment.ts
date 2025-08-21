import mongoose, { Schema } from "mongoose";

const AppointmentSchema = new Schema({
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true },
    serviceId: { type: mongoose.Schema.Types.ObjectId, ref: "Service", required: true },
    name: { type: String, required: true },
    lastName: { type: String, required: true },
    email: { type: String, required: true },
    dni: { type: String, required: true },
    phone: { type: String, required: true },
    date: { type: Date, required: true },
    paymentId: { type: String },
    totalPaidAmount: { type: Number },
    createdAt: { type: Date, default: Date.now },
    updateAt: { type: Date, default: Date.now }
})

const AppointmentModel = mongoose.model("Appointment", AppointmentSchema);

export default AppointmentModel;