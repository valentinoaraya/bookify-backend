import { Router } from "express";
import { cancelAppointment, confirmAppointment, confirmAppointmentWebhook, deleteAppointment, getAppointment, getCompanyHistory, testCompanyData } from "../controllers/appointmentController";
import { authenticateTokenCompany } from "../middlewares/verifyTokens";
import { verifyDataUser } from "../middlewares/verifyDataUser";

const appointmentsRouter = Router()

appointmentsRouter.get("/get-appointment/:id", getAppointment)
appointmentsRouter.post("/add-appointment", verifyDataUser, confirmAppointment)
appointmentsRouter.delete("/cancel-appointment/:id", verifyDataUser, cancelAppointment)
appointmentsRouter.delete("/delete-appointment/:id", authenticateTokenCompany, deleteAppointment)
appointmentsRouter.post("/webhooks/confirm-appointment", confirmAppointmentWebhook)
appointmentsRouter.get("/company-history/:companyId", getCompanyHistory)
appointmentsRouter.get("/test-company-data/:companyId", testCompanyData)

export default appointmentsRouter

