import mongoose, { Schema } from "mongoose";

const reminderSchema = new Schema({
    hoursBefore: { type: Number, required: true },
    services: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Service' }]
})

const suscription = new Schema({
    suscription_id: { type: String },
    plan: { type: String, enum: ["individual", "individual_plus", "team"] },
    status_suscription: { type: String, enum: ["active", "inactive", "pending"], default: "pending" },
    start_date: { type: Date },
    next_payment_date: { type: Date },
})

const CompanySchema = new Schema({
    name: { type: String, required: true },
    company_id: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    city: { type: String },
    street: { type: String },
    number: { type: String },
    phone: { type: String, required: true },
    suscription: suscription,
    role: { type: String, enum: ["admin", "user"], default: "user" },
    services: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Service' }],
    scheduledAppointments: [{ type: mongoose.Schema.Types.ObjectId, ref: "Appointment" }],
    connectedWithMP: { type: Boolean, default: false },
    mp_access_token: { type: String, default: "" },
    mp_refresh_token: { type: String, default: "" },
    token_expires_in: { type: Number, default: 0 },
    mp_user_id: { type: String, default: "" },
    reminders: [reminderSchema],
    slotsVisibilityDays: { type: Number, required: true, default: 7 },
    cancellationAnticipationHours: { type: Number, default: 24 },
    bookingAnticipationHours: { type: Number, default: 1 },
    refresh_token: { type: String, default: "" },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
});

const CompanyModel = mongoose.model("Company", CompanySchema)

export default CompanyModel