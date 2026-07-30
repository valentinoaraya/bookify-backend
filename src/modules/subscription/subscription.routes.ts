import { Router } from "express"
import { validate } from "../../shared/http/validate"
import { AuthMiddlewares } from "../auth/auth.middleware"
import { SubscriptionController } from "./subscription.controller"
import {
    cancelSubscriptionSchema,
    downgradeSubscriptionSchema,
    resumeSubscriptionSchema,
    resumeUpgradeSchema,
    upgradeSubscriptionSchema,
} from "../payment/payment.schema"

export const createSubscriptionRoutes = (
    subscriptionController: SubscriptionController,
    authMiddlewares: AuthMiddlewares
): Router => {
    const router = Router()
    const { authenticateTokenCompany } = authMiddlewares

    router.post(
        "/upgrade/:suscriptionId",
        authenticateTokenCompany,
        validate(upgradeSubscriptionSchema),
        subscriptionController.upgrade
    )
    router.post(
        "/downgrade/:suscriptionId",
        authenticateTokenCompany,
        validate(downgradeSubscriptionSchema),
        subscriptionController.downgrade
    )
    router.delete(
        "/cancel/:suscriptionId",
        authenticateTokenCompany,
        validate(cancelSubscriptionSchema),
        subscriptionController.cancel
    )
    router.post(
        "/resume",
        authenticateTokenCompany,
        validate(resumeSubscriptionSchema),
        subscriptionController.resume
    )
    router.post(
        "/resume-upgrade",
        authenticateTokenCompany,
        validate(resumeUpgradeSchema),
        subscriptionController.resumeUpgrade
    )
    router.post(
        "/abort-upgrade",
        authenticateTokenCompany,
        subscriptionController.abortUpgrade
    )

    return router
}
