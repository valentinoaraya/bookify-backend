import { Router } from "express";
import { createCompany, getCompanies } from "../controllers/CompanyController/companyController";

const companiesRouter = Router()

companiesRouter.get("/allcompanies", getCompanies)
companiesRouter.post("/", createCompany)

export default companiesRouter