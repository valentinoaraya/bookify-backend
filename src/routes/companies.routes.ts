import { Router } from "express";
import { createCompany, getCompany, getCompanyToUser, loginCompany, updateCompany, refreshToken, logoutCompany } from "../controllers/companyController";
import { authenticateTokenCompany, authenticateRefreshTokenCompany } from "../middlewares/verifyTokens";

const companiesRouter = Router()

companiesRouter.put("/update-company", authenticateTokenCompany, updateCompany)
companiesRouter.post("/login", loginCompany)
companiesRouter.post("/register", createCompany)
companiesRouter.post("/logout", authenticateTokenCompany, logoutCompany)
companiesRouter.post("/refresh-token", authenticateRefreshTokenCompany, refreshToken)
companiesRouter.get("/get-company", authenticateTokenCompany, getCompany)
companiesRouter.get("/company/:company_id", getCompanyToUser)

export default companiesRouter

