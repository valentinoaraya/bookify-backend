import { Router } from "express";
import { createCompany, getCompanies, getCompaniesServices, getCompany, getCompanyById, loginCompany, updateCompany } from "../controllers/companyController";
import { authenticateTokenCompany } from "../middlewares/verifyTokens";

const companiesRouter = Router()

companiesRouter.get("/", getCompanies)
companiesRouter.put("/update-company", authenticateTokenCompany, updateCompany)
companiesRouter.post("/login", loginCompany)
companiesRouter.post("/register", createCompany)
companiesRouter.get("/search", getCompaniesServices)
companiesRouter.get("/company/:id", getCompanyById)
companiesRouter.get("/get-company", authenticateTokenCompany, getCompany)

export default companiesRouter