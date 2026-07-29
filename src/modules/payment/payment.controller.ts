import { Request, Response } from "express"
import { env } from "../../config/env"
import { asyncHandler, UnauthorizedError } from "../../shared/errors"
import { logger } from "../../shared/logger"
import { PendingReservationUserData } from "../pending-reservation/pending-reservation.types"
import { PaymentService } from "./payment.service"

type PendingHelpers = {
    markPending: (
        serviceId: string,
        date: Date,
        userId: string,
        userData: PendingReservationUserData
    ) => Promise<string | null>
    removePending: (serviceId: string, pendingId: string) => Promise<boolean>
}

export class PaymentController {
    constructor(
        private readonly paymentService: PaymentService,
        private readonly pendingHelpers: PendingHelpers
    ) {}

    createPreference = asyncHandler(async (req: Request, res: Response) => {
        if (!req.user) throw new UnauthorizedError("Usuario no autorizado.")
        const data = await this.paymentService.createPreference(
            req.params.empresaId,
            req.user,
            req.body,
            this.pendingHelpers.markPending,
            this.pendingHelpers.removePending
        )
        res.status(200).send(data)
    })

    oauthCallback = asyncHandler(async (req: Request, res: Response) => {
        const errorRedirect = `${env.FRONTEND_URL}/panel/mercadopago-error`
        const { code, state } = req.query
        if (!code || !state) {
            logger.warn("Callback OAuth sin code o state")
            return res.redirect(errorRedirect)
        }
        try {
            const redirectUrl = await this.paymentService.handleOAuthCallback(
                String(code),
                String(state)
            )
            return res.redirect(redirectUrl)
        } catch (err) {
            logger.error({ err }, "Error en callback OAuth de Mercado Pago")
            return res.redirect(errorRedirect)
        }
    })

    generateOAuthUrl = asyncHandler(async (req: Request, res: Response) => {
        if (!req.company?.id) {
            throw new UnauthorizedError("Empresa no autorizada.")
        }
        const data = await this.paymentService.generateOAuthUrl(
            req.params.empresaId,
            String(req.company.id)
        )
        res.status(200).send(data)
    })

    webhooks = asyncHandler(async (req: Request, res: Response) => {
        const result = await this.paymentService.handleWebhook(req.body)
        res.status(result.status).send(result.payload)
    })
}
