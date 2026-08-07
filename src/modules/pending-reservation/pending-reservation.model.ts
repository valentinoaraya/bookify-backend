import mongoose, { Schema, Model } from "mongoose"
import { PendingReservationDocument } from "./pending-reservation.types"

/**
 * Datos del cliente que reservó. Se guardan acá para que el webhook de pago los
 * lea por `pendingId` en lugar de recibirlos serializados en el
 * `external_reference` de Mercado Pago.
 */
const pendingUserDataSchema = new Schema(
    {
        name: { type: String, required: true },
        lastName: { type: String, required: true },
        email: { type: String, required: true },
        dni: { type: String, required: true },
        phone: { type: String, required: true },
        userLocation: { type: String },
        locationId: { type: String },
    },
    { _id: false }
)

const PendingReservationSchema = new Schema<PendingReservationDocument>({
    slotId: { type: Schema.Types.ObjectId, ref: "Slot", required: true },
    serviceId: { type: Schema.Types.ObjectId, ref: "Service", required: true },
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true },
    userKey: { type: String, required: true },
    userData: { type: pendingUserDataSchema },
    // Ventana en la que la reserva bloquea el slot (15 min).
    holdUntil: { type: Date },
    // Orden de llegada al cupo (para resolver carreras de over-hold).
    holdAcquiredAt: { type: Date },
    // Momento de borrado físico (TTL). Es más largo que `holdUntil` para que un
    // webhook de pago demorado todavía encuentre los datos del cliente.
    expiresAt: { type: Date, required: true },
    preferenceExternalRef: { type: String },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
})

PendingReservationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })
PendingReservationSchema.index({ slotId: 1, holdUntil: 1 })
PendingReservationSchema.index({ slotId: 1, holdAcquiredAt: 1, _id: 1 })
PendingReservationSchema.index({ slotId: 1 })
PendingReservationSchema.index({ serviceId: 1, userKey: 1 })
// Un mismo usuario no puede acumular reservas temporales sobre el mismo slot:
// si reintenta el checkout, se reutiliza la que ya tiene.
PendingReservationSchema.index({ slotId: 1, userKey: 1 }, { unique: true })

export const PendingReservationModel: Model<PendingReservationDocument> =
    mongoose.models.PendingReservation ||
    mongoose.model<PendingReservationDocument>(
        "PendingReservation",
        PendingReservationSchema,
        "pending_reservations"
    )

export default PendingReservationModel
