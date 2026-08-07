import { Request, Response } from "express"
import { UnauthorizedError } from "../../shared/errors"
import { asyncHandler } from "../../shared/errors"
import { CompanyService } from "./company.service"
import { AuthService } from "../auth/auth.service"
import { CompanyMapper } from "./company.mapper"
import { Email } from "../../types"

export class CompanyController {
    constructor(
        private readonly companyService: CompanyService,
        private readonly authService: AuthService
    ) {}

    register = asyncHandler(async (req: Request, res: Response) => {
        const data = await this.companyService.register(req.body)
        res.status(200).send({ data })
    })

    login = asyncHandler(async (req: Request, res: Response) => {
        const result = await this.authService.login(req.body)
        res.status(200).send({
            data: CompanyMapper.toLoginResponse(result),
        })
    })

    getCompany = asyncHandler(async (req: Request, res: Response) => {
        if (!req.company) {
            throw new UnauthorizedError("No se pudo verificar la identidad de la empresa")
        }
        const data = await this.companyService.getPanel(req.company.id)
        res.status(200).send({ data })
    })

    updateCompany = asyncHandler(async (req: Request, res: Response) => {
        if (!req.company) {
            throw new UnauthorizedError("No se pudo verificar la identidad de la empresa")
        }
        const data = await this.companyService.update(req.company.id, req.body)
        res.status(200).send({ data })
    })

    addLocation = asyncHandler(async (req: Request, res: Response) => {
        if (!req.company) {
            throw new UnauthorizedError("No se pudo verificar la identidad de la empresa")
        }
        const data = await this.companyService.addLocation(req.company.id, req.body)
        res.status(200).send({ data })
    })

    updateLocation = asyncHandler(async (req: Request, res: Response) => {
        if (!req.company) {
            throw new UnauthorizedError("No se pudo verificar la identidad de la empresa")
        }
        const data = await this.companyService.updateLocation(
            req.company.id,
            req.params.locationId,
            req.body
        )
        res.status(200).send({ data })
    })

    deleteLocation = asyncHandler(async (req: Request, res: Response) => {
        if (!req.company) {
            throw new UnauthorizedError("No se pudo verificar la identidad de la empresa")
        }
        const data = await this.companyService.deleteLocation(
            req.company.id,
            req.params.locationId
        )
        res.status(200).send({ data })
    })

    setDefaultLocation = asyncHandler(async (req: Request, res: Response) => {
        if (!req.company) {
            throw new UnauthorizedError("No se pudo verificar la identidad de la empresa")
        }
        const data = await this.companyService.setDefaultLocation(
            req.company.id,
            req.params.locationId
        )
        res.status(200).send({ data })
    })

    getCompanyToUser = asyncHandler(async (req: Request, res: Response) => {
        const company = await this.companyService.getPublicBySlug(req.params.company_id)
        res.status(200).send({ data: company })
    })

    refreshToken = asyncHandler(async (req: Request, res: Response) => {
        if (!req.company) {
            throw new UnauthorizedError("No se pudo verificar la identidad de la empresa")
        }

        const tokens = await this.authService.refresh(
            req.company.id,
            req.company.name,
            req.company.email as Email
        )

        res.status(200).send({ data: tokens })
    })

    logout = asyncHandler(async (req: Request, res: Response) => {
        if (!req.company) {
            throw new UnauthorizedError("No se pudo verificar la identidad de la empresa")
        }

        await this.authService.logout(req.company.id)
        res.status(200).send({ message: "Logout exitoso" })
    })
}
