import { Router } from "express";
import { cancelAppointment, confirmAppointment, confirmAppointmentWebhook, deleteAppointment } from "../controllers/appointmentController";
import { authenticateTokenCompany, authenticateTokenUser } from "../middlewares/verifyTokens";

const appointmentsRouter = Router()

appointmentsRouter.post("/add-appointment", authenticateTokenUser, confirmAppointment)
appointmentsRouter.delete("/cancel-appointment/:id", authenticateTokenUser, cancelAppointment)
appointmentsRouter.delete("/delete-appointment/:id", authenticateTokenCompany, deleteAppointment)
appointmentsRouter.post("/webhooks/confirm-appointment", confirmAppointmentWebhook)

export default appointmentsRouter