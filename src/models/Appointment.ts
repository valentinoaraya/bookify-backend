import mongoose, { Schema } from "mongoose";

const AppointmentSchema = new Schema({
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true },
    serviceId: { type: mongoose.Schema.Types.ObjectId, ref: "Service", required: true },
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    date: { type: Date, required: true },
    paymentId: { type: String },
    createdAt: { type: Date, default: Date.now },
    updateAt: { type: Date, default: Date.now }
})

const AppointmentModel = mongoose.model("Appointment", AppointmentSchema);

export default AppointmentModel;