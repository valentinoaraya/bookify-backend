import { Router } from "express";
import { createCompany, getCompanies, loginCompany } from "../controllers/companyController";

const companiesRouter = Router()

companiesRouter.get("/", getCompanies)
companiesRouter.post("/login", loginCompany)
companiesRouter.post("/register", createCompany)

export default companiesRouter