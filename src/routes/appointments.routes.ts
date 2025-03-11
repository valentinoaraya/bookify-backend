import { Router } from "express";
import { cancelAppointment, createAppointment, deleteAppointment } from "../controllers/appointmentController";
import { authenticateTokenCompany, authenticateTokenUser } from "../middlewares/verifyTokens";

const appointmentsRouter = Router()

appointmentsRouter.post("/webhooks/confirm-appointment", createAppointment)
appointmentsRouter.delete("/cancel-appointment/:id", authenticateTokenUser, cancelAppointment)
appointmentsRouter.delete("/delete-appointment/:id", authenticateTokenCompany, deleteAppointment)

export default appointmentsRouter