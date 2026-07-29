import { Request, Response } from "express"
import {
    asyncHandler,
    ForbiddenError,
    UnauthorizedError,
} from "../../shared/errors"
import { SubscriptionService } from "./subscription.service"

export class SubscriptionController {
    constructor(private readonly subscriptionService: SubscriptionService) {}

    private requireCompanyId(req: Request): string {
        if (!req.company) throw new UnauthorizedError("Usuario no autorizado")
        return String(req.company.id)
    }

    private assertBodyCompanyMatches(req: Request, companyId: string) {
        const bodyCompanyId = req.body?.companyId
        if (bodyCompanyId && String(bodyCompanyId) !== companyId) {
            throw new ForbiddenError(
                "No podés operar la suscripción de otra empresa."
            )
        }
    }

    upgrade = asyncHandler(async (req: Request, res: Response) => {
        const companyId = this.requireCompanyId(req)
        this.assertBodyCompanyMatches(req, companyId)
        const data = await this.subscriptionService.upgrade(
            req.params.suscriptionId,
            {
                newPlan: req.body.newPlan,
                payer_email: req.body.payer_email,
                companyId,
            }
        )
        res.status(200).send({ data })
    })

    downgrade = asyncHandler(async (req: Request, res: Response) => {
        const companyId = this.requireCompanyId(req)
        this.assertBodyCompanyMatches(req, companyId)
        const data = await this.subscriptionService.downgrade(
            req.params.suscriptionId,
            {
                newPlan: req.body.newPlan,
                companyId,
            }
        )
        res.status(200).send({ data })
    })

    cancel = asyncHandler(async (req: Request, res: Response) => {
        const companyId = this.requireCompanyId(req)
        this.assertBodyCompanyMatches(req, companyId)
        const data = await this.subscriptionService.cancel(
            req.params.suscriptionId,
            companyId
        )
        res.status(200).send({ data })
    })

    resume = asyncHandler(async (req: Request, res: Response) => {
        const companyId = this.requireCompanyId(req)
        const data = await this.subscriptionService.resume(companyId, req.body)
        res.status(200).send({ data })
    })

    resumeUpgrade = asyncHandler(async (req: Request, res: Response) => {
        const companyId = this.requireCompanyId(req)
        const data = await this.subscriptionService.resumeUpgrade(
            companyId,
            req.body
        )
        res.status(200).send({ data })
    })

    abortUpgrade = asyncHandler(async (req: Request, res: Response) => {
        const companyId = this.requireCompanyId(req)
        const data = await this.subscriptionService.abortUpgrade(companyId)
        res.status(200).send({ data })
    })
}
