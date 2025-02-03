import { Router } from "express";
import { createService, deleteService, editService } from "../controllers/serviceController";
import { authenticateTokenCompany } from "../middlewares/verifyTokens";
import verifyService from "../middlewares/verifyServices";

const servicesRouter = Router()

servicesRouter.post("/create-service", authenticateTokenCompany, createService)
servicesRouter.put("/edit-service/:id", authenticateTokenCompany, verifyService, editService)
servicesRouter.delete("/delete-service/:id", authenticateTokenCompany, verifyService, deleteService)

export default servicesRouter