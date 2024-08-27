import { Router } from "express";
import { createCompany, getCompanies } from "../controllers/companyController";

const companiesRouter = Router()

companiesRouter.get("/allcompanies", getCompanies)
companiesRouter.post("/", createCompany)

export default companiesRouter