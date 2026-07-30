import { Router } from "express"
import { validate } from "../../shared/http/validate"
import { CompanyController } from "./company.controller"
import {
    loginCompanySchema,
    registerCompanySchema,
    updateCompanySchema,
} from "./company.schema"
import { AuthMiddlewares } from "../auth/auth.middleware"
import { authLimiter } from "../../middlewares/rateLimiters"

export const createCompanyRoutes = (
    companyController: CompanyController,
    authMiddlewares: AuthMiddlewares
): Router => {
    const router = Router()
    const { authenticateTokenCompany, authenticateRefreshTokenCompany } = authMiddlewares

    router.put(
        "/update-company",
        authenticateTokenCompany,
        validate(updateCompanySchema),
        companyController.updateCompany
    )
    router.post(
        "/login",
        authLimiter,
        validate(loginCompanySchema),
        companyController.login
    )
    router.post(
        "/register",
        authLimiter,
        validate(registerCompanySchema),
        companyController.register
    )
    router.post("/logout", authenticateTokenCompany, companyController.logout)
    router.post(
        "/refresh-token",
        authenticateRefreshTokenCompany,
        companyController.refreshToken
    )
    router.get("/get-company", authenticateTokenCompany, companyController.getCompany)
    router.get("/company/:company_id", companyController.getCompanyToUser)

    return router
}
