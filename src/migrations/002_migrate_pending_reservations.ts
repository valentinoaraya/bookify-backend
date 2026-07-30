/**
 * Migración 002: Service.pendingAppointments → colección pending_reservations.
 * Solo migra pending con expiresAt > now. Resuelve slotId por serviceId+datetime.
 * Idempotente.
 */
import mongoose from "mongoose"
import { env } from "../config/env"
import "../modules/service/service.model"
import { ServiceModel } from "../modules/service/service.model"
import { SlotModel } from "../modules/slot/slot.model"
import { PendingReservationModel } from "../modules/pending-reservation/pending-reservation.model"

const migratePendingReservations = async () => {
    await mongoose.connect(env.MONGODB_URL_CONNECTION)
    console.log("✅ Conectado a MongoDB — migrate pending reservations")

    const now = new Date()
    const services = await ServiceModel.find({
        "pendingAppointments.0": { $exists: true },
    }).lean() as any[]

    let created = 0
    let skipped = 0
    let missingSlot = 0

    for (const service of services) {
        for (const pending of service.pendingAppointments || []) {
            if (!pending.expiresAt || new Date(pending.expiresAt) <= now) {
                skipped++
                continue
            }

            const datetime = new Date(pending.datetime)
            const slot = await SlotModel.findOne({
                serviceId: service._id,
                datetime,
            }).lean()

            if (!slot) {
                missingSlot++
                console.warn(
                    `⚠️ Sin slot para service=${service._id} datetime=${datetime.toISOString()}`
                )
                continue
            }

            const pendingId = pending._id
            const existing = pendingId
                ? await PendingReservationModel.findById(pendingId).lean()
                : await PendingReservationModel.findOne({
                      slotId: slot._id,
                      userKey: pending.userId,
                      expiresAt: new Date(pending.expiresAt),
                  }).lean()

            if (existing) {
                skipped++
                continue
            }

            await PendingReservationModel.create({
                _id: pendingId || undefined,
                slotId: slot._id,
                serviceId: service._id,
                companyId: service.companyId,
                userKey: pending.userId,
                expiresAt: new Date(pending.expiresAt),
            })
            created++
        }
    }

    console.log(
        `✅ Pending reservations creadas: ${created}, omitidas: ${skipped}, sin slot: ${missingSlot}`
    )
    await mongoose.disconnect()
}

if (require.main === module) {
    migratePendingReservations().catch((err) => {
        console.error(err)
        process.exit(1)
    })
}

export { migratePendingReservations }
