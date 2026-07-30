/**
 * One-shot para pending_reservations:
 * 1. Copia `expiresAt` en el nuevo campo `holdUntil` (ventana de bloqueo).
 * 2. Elimina reservas duplicadas de un mismo usuario sobre un mismo slot, que
 *    impedirían crear el índice único (slotId, userKey).
 * 3. syncIndexes para aplicar los índices nuevos.
 */
import mongoose from "mongoose"
import { env } from "../config/env"
import { PendingReservationModel } from "../modules/pending-reservation/pending-reservation.model"

const run = async () => {
    await mongoose.connect(env.MONGODB_URL_CONNECTION)
    console.log("✅ Conectado — pending_reservations hold")

    const backfilled = await PendingReservationModel.updateMany(
        { holdUntil: { $exists: false } },
        [{ $set: { holdUntil: "$expiresAt" } }]
    )
    console.log(`✅ holdUntil seteado en ${backfilled.modifiedCount} documento(s).`)

    const duplicates = await PendingReservationModel.aggregate<{
        _id: { slotId: unknown; userKey: string }
        ids: mongoose.Types.ObjectId[]
    }>([
        { $sort: { createdAt: -1 } },
        {
            $group: {
                _id: { slotId: "$slotId", userKey: "$userKey" },
                ids: { $push: "$_id" },
            },
        },
        { $match: { "ids.1": { $exists: true } } },
    ])

    const idsToDelete = duplicates.flatMap((group) => group.ids.slice(1))
    if (idsToDelete.length > 0) {
        const deleted = await PendingReservationModel.deleteMany({
            _id: { $in: idsToDelete },
        })
        console.log(`🗑️  ${deleted.deletedCount} reserva(s) duplicada(s) eliminada(s).`)
    } else {
        console.log("✅ Sin reservas duplicadas.")
    }

    const result = await PendingReservationModel.syncIndexes()
    console.log("✅ Índices sincronizados:", result)

    await mongoose.disconnect()
}

run().catch((err) => {
    console.error(err)
    process.exit(1)
})
