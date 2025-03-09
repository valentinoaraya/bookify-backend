import mongoose, { Schema } from "mongoose";

const CompanySchema = new Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    city: { type: String, required: true },
    street: { type: String, required: true },
    number: { type: String, required: true },
    phone: { type: String, required: true },
    role: { type: String, enum: ["admin", "user"], default: "user" },
    services: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Service' }],
    scheduledAppointments: [{ type: mongoose.Schema.Types.ObjectId, ref: "Appointment" }],
    connectedWithMP: { type: Boolean, default: false },
    mp_access_token: { type: String, default: "" },
    mp_refresh_token: { type: String, default: "" },
    mp_user_id: { type: String, default: "" },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
});

const CompanyModel = mongoose.model("Company", CompanySchema)

export default CompanyModel