/**
 * Migración 004: Company.suscription → colección subscriptions + company.subscriptionId.
 * Idempotente vía unique companyId en subscriptions.
 */
import mongoose from "mongoose"
import { env } from "../config/env"
import "../modules/company/company.model"
import { CompanyModel } from "../modules/company/company.model"
import { SubscriptionModel } from "../modules/subscription/subscription.model"

const migrateSubscriptions = async () => {
    await mongoose.connect(env.MONGODB_URL_CONNECTION)
    console.log("✅ Conectado a MongoDB — migrate subscriptions")

    const companies = await CompanyModel.find({
        suscription: { $exists: true },
    }).lean() as any[]

    let created = 0
    let linked = 0
    let skipped = 0

    for (const company of companies) {
        const emb = company.suscription
        if (!emb?.plan) {
            skipped++
            continue
        }

        let subscription: { _id: mongoose.Types.ObjectId } | null =
            await SubscriptionModel.findOne({
                companyId: company._id,
            }).lean()

        if (!subscription) {
            const doc = await SubscriptionModel.create({
                companyId: company._id,
                mpPreapprovalId: emb.suscription_id,
                plan: emb.plan,
                status: emb.status_suscription || "pending",
                startDate: emb.start_date,
                nextPaymentDate: emb.next_payment_date,
            })
            subscription = { _id: doc._id }
            created++
        } else {
            skipped++
        }

        if (
            !company.subscriptionId ||
            String(company.subscriptionId) !== String(subscription._id)
        ) {
            await CompanyModel.updateOne(
                { _id: company._id },
                { $set: { subscriptionId: subscription._id } }
            )
            linked++
        }
    }

    console.log(
        `✅ Subscriptions creadas: ${created}, ya existentes: ${skipped}, companies vinculadas: ${linked}`
    )
    await mongoose.disconnect()
}

if (require.main === module) {
    migrateSubscriptions().catch((err) => {
        console.error(err)
        process.exit(1)
    })
}

export { migrateSubscriptions }
