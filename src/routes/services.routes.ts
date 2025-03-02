import { Router } from "express";
import { createService, deleteEnabledAppointment, deleteService, editService, enabledAppointments, searchServices } from "../controllers/serviceController";
import { authenticateTokenCompany, authenticateTokenUser } from "../middlewares/verifyTokens";
import verifyService from "../middlewares/verifyServices";

const servicesRouter = Router()

servicesRouter.post("/create-service", authenticateTokenCompany, createService)
servicesRouter.put("/edit-service/:id", authenticateTokenCompany, verifyService, editService)
servicesRouter.delete("/delete-service/:id", authenticateTokenCompany, verifyService, deleteService)
servicesRouter.post("/enable-appointments/:id", authenticateTokenCompany, verifyService, enabledAppointments)
servicesRouter.delete("/delete-appointment/:id", authenticateTokenCompany, verifyService, deleteEnabledAppointment)
servicesRouter.get("/search", authenticateTokenUser, searchServices)

export default servicesRouter