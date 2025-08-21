import { Router } from "express";
import { addEnableAppointment, containsSignPrice, createService, deleteEnabledAppointment, deleteService, editService, enabledAppointments, getService } from "../controllers/serviceController";
import { authenticateTokenCompany } from "../middlewares/verifyTokens";
import verifyService from "../middlewares/verifyServices";

const servicesRouter = Router()

servicesRouter.post("/create-service", authenticateTokenCompany, createService)
servicesRouter.put("/edit-service/:id", authenticateTokenCompany, verifyService, editService)
servicesRouter.delete("/delete-service/:id", authenticateTokenCompany, verifyService, deleteService)
servicesRouter.post("/enable-appointments/:id", authenticateTokenCompany, verifyService, enabledAppointments)
servicesRouter.post("/add-enable-appointment/:id", authenticateTokenCompany, verifyService, addEnableAppointment)
servicesRouter.delete("/delete-appointment/:id", authenticateTokenCompany, verifyService, deleteEnabledAppointment)
servicesRouter.get("/:id", getService)
servicesRouter.get("/contains-sign-price/:id", containsSignPrice)

export default servicesRouter