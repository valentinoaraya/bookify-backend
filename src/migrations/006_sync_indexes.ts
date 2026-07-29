/**
 * One-shot: syncIndexes de colecciones nuevas tras migraciones.
 */
import mongoose from "mongoose"
import { env } from "../config/env"
import { AppointmentModel } from "../modules/appointment/appointment.model"
import { CompanyModel } from "../modules/company/company.model"
import { PaymentModel } from "../modules/payment/payment.model"
import { PendingReservationModel } from "../modules/pending-reservation/pending-reservation.model"
import { SlotModel } from "../modules/slot/slot.model"
import { SubscriptionModel } from "../modules/subscription/subscription.model"

const syncAllIndexes = async () => {
    await mongoose.connect(env.MONGODB_URL_CONNECTION)
    console.log("✅ Conectado — sync indexes")

    const models = [
        SlotModel,
        PendingReservationModel,
        PaymentModel,
        SubscriptionModel,
        AppointmentModel,
        CompanyModel,
    ]

    for (const m of models) {
        const result = await m.syncIndexes()
        console.log(`✅ ${m.collection.name}:`, result)
    }

    const cols = await mongoose.connection.db!.listCollections().toArray()
    console.log(
        "Colecciones:",
        cols
            .map((c) => c.name)
            .sort()
            .join(", ")
    )

    await mongoose.disconnect()
}

syncAllIndexes().catch((err) => {
    console.error(err)
    process.exit(1)
})
