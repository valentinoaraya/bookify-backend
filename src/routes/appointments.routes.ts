import { Router } from "express";
import { cancelAppointment, checkOrderTime, confirmAppointment, deleteAppointment, getAppointment, getCompanyHistory, testCompanyData } from "../controllers/appointmentController";
import { authenticateTokenCompany } from "../middlewares/verifyTokens";
import { verifyDataUser } from "../middlewares/verifyDataUser";

const appointmentsRouter = Router()

appointmentsRouter.get("/get-appointment/:id", getAppointment)
appointmentsRouter.post("/add-appointment", verifyDataUser, confirmAppointment)
appointmentsRouter.delete("/cancel-appointment/:id", verifyDataUser, cancelAppointment)
appointmentsRouter.delete("/delete-appointment/:id", authenticateTokenCompany, deleteAppointment)
appointmentsRouter.get("/company-history/:companyId", getCompanyHistory)
appointmentsRouter.get("/test-company-data/:companyId", testCompanyData)
appointmentsRouter.post("/check-booking-hour", checkOrderTime)

export default appointmentsRouter