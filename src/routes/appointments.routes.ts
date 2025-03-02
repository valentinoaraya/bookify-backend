import { Router } from "express";
import { cancelAppointment, createAppointment } from "../controllers/appointmentController";
import { authenticateTokenUser } from "../middlewares/verifyTokens";

const appointmentsRouter = Router()

appointmentsRouter.post("/add-appointment", authenticateTokenUser, createAppointment)
appointmentsRouter.delete("/cancel-appointment/:id", authenticateTokenUser, cancelAppointment)

export default appointmentsRouter