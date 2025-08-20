import { Router } from "express";
import { addEnableAppointment, createService, deleteEnabledAppointment, deleteService, editService, enabledAppointments } from "../controllers/serviceController";
import { authenticateTokenCompany } from "../middlewares/verifyTokens";
import verifyService from "../middlewares/verifyServices";

const servicesRouter = Router()

servicesRouter.post("/create-service", authenticateTokenCompany, createService)
servicesRouter.put("/edit-service/:id", authenticateTokenCompany, verifyService, editService)
servicesRouter.delete("/delete-service/:id", authenticateTokenCompany, verifyService, deleteService)
servicesRouter.post("/enable-appointments/:id", authenticateTokenCompany, verifyService, enabledAppointments)
servicesRouter.post("/add-enable-appointment/:id", authenticateTokenCompany, verifyService, addEnableAppointment)
servicesRouter.delete("/delete-appointment/:id", authenticateTokenCompany, verifyService, deleteEnabledAppointment)

export default servicesRouter