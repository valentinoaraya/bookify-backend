/**
 * Migración 003: Appointment.paymentId (string MP) → colección payments + paymentRef.
 * Idempotente vía unique mpPaymentId.
 */
import mongoose from "mongoose"
import { env } from "../config/env"
import "../modules/appointment/appointment.model"
import { AppointmentModel } from "../modules/appointment/appointment.model"
import { PaymentModel } from "../modules/payment/payment.model"

const migratePayments = async () => {
    await mongoose.connect(env.MONGODB_URL_CONNECTION)
    console.log("✅ Conectado a MongoDB — migrate payments")

    const appointments = await AppointmentModel.find({
        paymentId: { $exists: true, $nin: [null, ""] },
    }).lean()

    let created = 0
    let linked = 0
    let skipped = 0

    for (const appointment of appointments) {
        const mpPaymentId = String(appointment.paymentId)
        if (!mpPaymentId) {
            skipped++
            continue
        }

        let payment: { _id: mongoose.Types.ObjectId } | null = await PaymentModel.findOne({
            mpPaymentId,
        }).lean()

        if (!payment) {
            const doc = await PaymentModel.create({
                mpPaymentId,
                companyId: appointment.companyId,
                appointmentId: appointment._id,
                serviceId: appointment.serviceId,
                amount: appointment.totalPaidAmount ?? 0,
                currency: "ARS",
                status: "approved",
                refundedAmount: 0,
            })
            payment = { _id: doc._id }
            created++
        } else {
            skipped++
        }

        if (
            !appointment.paymentRef ||
            String(appointment.paymentRef) !== String(payment._id)
        ) {
            await AppointmentModel.updateOne(
                { _id: appointment._id },
                { $set: { paymentRef: payment._id } }
            )
            linked++
        }
    }

    console.log(
        `✅ Payments creados: ${created}, ya existentes: ${skipped}, appointments vinculados: ${linked}`
    )
    await mongoose.disconnect()
}

if (require.main === module) {
    migratePayments().catch((err) => {
        console.error(err)
        process.exit(1)
    })
}

export { migratePayments }
