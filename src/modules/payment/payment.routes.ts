import { Router } from "express"
import { validate } from "../../shared/http/validate"
import { AuthMiddlewares } from "../auth/auth.middleware"
import { verifyDataUser } from "../../middlewares/verifyDataUser"
import { verifyMercadoPagoSignature } from "../../middlewares/verifyMercadoPagoSignature"
import { bookingLimiter } from "../../middlewares/rateLimiters"
import { PaymentController } from "./payment.controller"
import { createPreferenceSchema } from "./payment.schema"

export const createPaymentRoutes = (
    paymentController: PaymentController,
    authMiddlewares: AuthMiddlewares
): Router => {
    const router = Router()
    const { authenticateTokenCompany } = authMiddlewares

    router.post(
        "/create-preference/:empresaId",
        bookingLimiter,
        verifyDataUser,
        validate(createPreferenceSchema),
        paymentController.createPreference
    )
    router.get("/oauth/callback", paymentController.oauthCallback)
    router.get(
        "/oauth/generate-url/:empresaId",
        authenticateTokenCompany,
        paymentController.generateOAuthUrl
    )
    router.post(
        "/webhooks",
        verifyMercadoPagoSignature,
        paymentController.webhooks
    )

    return router
}
