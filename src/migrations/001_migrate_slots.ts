/**
 * Migración 001: Service.availableAppointments + scheduledAppointments → colección slots.
 * Idempotente: unique index (serviceId, datetime).
 */
import mongoose from "mongoose"
import { env } from "../config/env"
import "../modules/service/service.model"
import { ServiceModel } from "../modules/service/service.model"
import { SlotModel } from "../modules/slot/slot.model"

const migrateSlots = async () => {
    await mongoose.connect(env.MONGODB_URL_CONNECTION)
    console.log("✅ Conectado a MongoDB — migrate slots")

    const services = await ServiceModel.find({}).lean() as any[]
    let upserted = 0
    let skipped = 0

    for (const service of services) {
        const byDatetime = new Map<
            number,
            { datetime: Date; capacity: number; taken: number }
        >()

        for (const app of service.availableAppointments || []) {
            const key = new Date(app.datetime).getTime()
            byDatetime.set(key, {
                datetime: new Date(app.datetime),
                capacity: app.capacity,
                taken: app.taken || 0,
            })
        }

        const scheduledCounts = new Map<number, number>()
        for (const d of service.scheduledAppointments || []) {
            const key = new Date(d).getTime()
            scheduledCounts.set(key, (scheduledCounts.get(key) || 0) + 1)
        }

        for (const [key, count] of scheduledCounts) {
            const existing = byDatetime.get(key)
            if (existing) {
                existing.taken = Math.max(existing.taken, count)
                existing.capacity = Math.max(existing.capacity, existing.taken)
            } else {
                byDatetime.set(key, {
                    datetime: new Date(key),
                    capacity: Math.max(count, service.capacityPerShift || 1),
                    taken: count,
                })
            }
        }

        for (const slot of byDatetime.values()) {
            const existing = await SlotModel.findOne({
                serviceId: service._id,
                datetime: slot.datetime,
            }).lean()

            if (existing) {
                skipped++
                continue
            }

            await SlotModel.create({
                serviceId: service._id,
                companyId: service.companyId,
                datetime: slot.datetime,
                capacity: slot.capacity,
                taken: slot.taken,
            })
            upserted++
        }
    }

    console.log(`✅ Slots creados: ${upserted}, ya existentes: ${skipped}`)
    await mongoose.disconnect()
}

if (require.main === module) {
    migrateSlots().catch((err) => {
        console.error(err)
        process.exit(1)
    })
}

export { migrateSlots }
