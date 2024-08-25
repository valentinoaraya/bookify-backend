import mongoose, { Schema } from "mongoose";

const AppointmentSchema = new Schema({
    companyId: {type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true},
    serviceId: {type: mongoose.Schema.Types.ObjectId, ref: "Service", required: true},
    clientId: {type: mongoose.Schema.Types.ObjectId, ref: "Client", required: true},
    date: {type: Date, required: true},
    status: {type: String, default: "reserved"},
    createdAt: {type: Date, default: Date.now},
    updateAt: {type: Date, default: Date.now}
})

const AppointmentModel = mongoose.model("Appointment", AppointmentSchema);

export default AppointmentModel;