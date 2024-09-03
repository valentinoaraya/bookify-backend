import { Router } from "express";
import { createAppointment } from "../controllers/appointmentController";
import { authenticateTokenUser } from "../middlewares/verifyTokens";

const appointmentsRouter = Router()

appointmentsRouter.post("/add-appointment", authenticateTokenUser, createAppointment)

export default appointmentsRouter