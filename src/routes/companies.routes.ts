import { Router } from "express";
import { createCompany, getCompany, loginCompany, updateCompany } from "../controllers/companyController";
import { authenticateTokenCompany } from "../middlewares/verifyTokens";

const companiesRouter = Router()

companiesRouter.put("/update-company", authenticateTokenCompany, updateCompany)
companiesRouter.post("/login", loginCompany)
companiesRouter.post("/register", createCompany)
companiesRouter.get("/get-company", authenticateTokenCompany, getCompany)

export default companiesRouter