import { Router } from "express";
import { cancelAppointment, checkOrderTime, confirmAppointment, deleteAppointment, finishAppointment, getAppointment, getCompanyHistory } from "../controllers/appointmentController";
import { authenticateTokenCompany } from "../middlewares/verifyTokens";
import { verifyDataUser } from "../middlewares/verifyDataUser";

const appointmentsRouter = Router()

appointmentsRouter.get("/get-appointment/:id", getAppointment)
appointmentsRouter.post("/add-appointment", verifyDataUser, confirmAppointment)
appointmentsRouter.put("/finish-appointment/:id", authenticateTokenCompany, finishAppointment)
appointmentsRouter.delete("/cancel-appointment/:id", verifyDataUser, cancelAppointment)
appointmentsRouter.delete("/delete-appointment/:id", authenticateTokenCompany, deleteAppointment)
appointmentsRouter.get("/company-history/:companyId", getCompanyHistory)
appointmentsRouter.post("/check-booking-hour", checkOrderTime)

export default appointmentsRouter