import { Router } from "express";
import { createCompany, getAppointmentsServices, getCompaniesServices, getCompany, getCompanyById, loginCompany, updateCompany } from "../controllers/companyController";
import { authenticateTokenCompany } from "../middlewares/verifyTokens";

const companiesRouter = Router()

companiesRouter.put("/update-company", authenticateTokenCompany, updateCompany)
companiesRouter.post("/login", loginCompany)
companiesRouter.post("/register", createCompany)
companiesRouter.get("/search", getCompaniesServices)
companiesRouter.get("/company/:id", getCompanyById)
companiesRouter.get("/get-company", authenticateTokenCompany, getCompany)
companiesRouter.get("/get-appointments-services/:id", authenticateTokenCompany, getAppointmentsServices)

export default companiesRouter