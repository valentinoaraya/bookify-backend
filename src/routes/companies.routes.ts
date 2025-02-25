import { Router } from "express";
import { createCompany, getAppointmentsServices, getCompanies, getCompaniesServices, getCompany, getCompanyById, loginCompany, logoutCompany, updateCompany } from "../controllers/companyController";
import { authenticateTokenCompany } from "../middlewares/verifyTokens";

const companiesRouter = Router()

companiesRouter.get("/", getCompanies)
companiesRouter.put("/update-company", authenticateTokenCompany, updateCompany)
companiesRouter.post("/login", loginCompany)
companiesRouter.post("/register", createCompany)
companiesRouter.post("/logout", logoutCompany)
companiesRouter.get("/search", getCompaniesServices)
companiesRouter.get("/company/:id", getCompanyById)
companiesRouter.get("/get-company", authenticateTokenCompany, getCompany)
companiesRouter.get("/get-appointments-services/:id", authenticateTokenCompany, getAppointmentsServices)

export default companiesRouter