import mongoose, { Schema } from "mongoose";

const reminderSchema = new Schema({
    hoursBefore: { type: Number, required: true },
    services: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Service' }]
})

const CompanySchema = new Schema({
    name: { type: String, required: true },
    company_id: { type: String, required: true, unique: true },
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
    token_expires_in: { type: Number, default: 0 },
    mp_user_id: { type: String, default: "" },
    reminders: [reminderSchema],
    cancellationAnticipationHours: { type: Number, default: 24 },
    bookingAnticipationHours: { type: Number, default: 1 },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
});

const CompanyModel = mongoose.model("Company", CompanySchema)

export default CompanyModel