import { Router } from "express";
import { createCompany, getCompanies, getCompaniesServices, getCompanyById, loginCompany } from "../controllers/companyController";

const companiesRouter = Router()

companiesRouter.get("/", getCompanies)
companiesRouter.post("/login", loginCompany)
companiesRouter.post("/register", createCompany)
companiesRouter.get("/search", getCompaniesServices)
companiesRouter.get("/:id", getCompanyById)

export default companiesRouter