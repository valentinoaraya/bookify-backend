import { z } from "zod"

export const createPreferenceSchema = z.object({
    serviceId: z.string().min(1),
    date: z.string().min(1),
})

const changeablePlanEnum = z.enum(["individual", "individual_plus"], {
    message: "Plan no disponible",
})

export const upgradeSubscriptionSchema = z.object({
    newPlan: changeablePlanEnum,
    payer_email: z.string().email(),
    companyId: z.string().min(1).optional(),
})

export const downgradeSubscriptionSchema = z.object({
    newPlan: changeablePlanEnum,
    companyId: z.string().min(1).optional(),
})

export const cancelSubscriptionSchema = z.object({
    companyId: z.string().min(1).optional(),
})

export const resumeSubscriptionSchema = z.object({
    payer_email: z.string().email().optional(),
})

export const resumeUpgradeSchema = z.object({
    payer_email: z.string().email().optional(),
})
