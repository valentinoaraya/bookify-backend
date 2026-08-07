import mongoose, { Schema, Model } from "mongoose"
import { AppointmentDocument } from "./appointment.types"

const serviceInfoSchema = new Schema({
    title: { type: String, required: true },
})

const locationSnapshotSchema = new Schema(
    {
        locationId: { type: mongoose.Schema.Types.ObjectId },
        name: { type: String, required: true },
        province: { type: String },
        city: { type: String, required: true },
        street: { type: String, required: true },
        number: { type: String, required: true },
    },
    { _id: false }
)

const AppointmentSchema = new Schema<AppointmentDocument>({
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true },
    serviceId: { type: mongoose.Schema.Types.ObjectId, ref: "Service", required: true },
    slotId: { type: mongoose.Schema.Types.ObjectId, ref: "Slot" },
    name: { type: String, required: true },
    price: { type: Number, required: true },
    duration: { type: Number, required: true },
    serviceInfo: serviceInfoSchema,
    lastName: { type: String, required: true },
    email: { type: String, required: true },
    dni: { type: String, required: true },
    phone: { type: String, required: true },
    status: {
        type: String,
        enum: ["scheduled", "finished", "cancelled", "pending_action", "did_not_attend"],
        default: "scheduled",
    },
    cancelledBy: {
        type: String,
        enum: ["company", "client", "null"],
        default: "null",
    },
    date: { type: Date, required: true },
    reminderJobs: [{ type: String }],
    mode: {
        type: String,
        enum: ["in-person", "online", "in-person-at-home"],
        default: "online",
    },
    /** Snapshot de la sede al momento de confirmar (presencial en local). */
    location: { type: locationSnapshotSchema },
    userLocation: { type: String },
    paymentId: { type: String },
    paymentRef: { type: mongoose.Schema.Types.ObjectId, ref: "Payment" },
    totalPaidAmount: { type: Number },
    createdAt: { type: Date, default: Date.now },
    updateAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
})

AppointmentSchema.index({ companyId: 1, status: 1, date: -1 })
AppointmentSchema.index({ serviceId: 1, status: 1 })
AppointmentSchema.index({ slotId: 1 })

export const AppointmentModel: Model<AppointmentDocument> =
    mongoose.models.Appointment ||
    mongoose.model<AppointmentDocument>("Appointment", AppointmentSchema)

export default AppointmentModel
