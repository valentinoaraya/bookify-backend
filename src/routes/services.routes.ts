import { Router } from "express";
import { createService, deleteService, editService } from "../controllers/serviceController";
import { authenticateTokenCompany } from "../middlewares/verifyTokens";

const servicesRouter = Router()

servicesRouter.post("/create-service", authenticateTokenCompany, createService)
servicesRouter.post("/edit-service/:id", authenticateTokenCompany, editService)
servicesRouter.post("/delete-service/:id", authenticateTokenCompany, deleteService)

export default servicesRouter