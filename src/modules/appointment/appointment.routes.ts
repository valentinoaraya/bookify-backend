import { Router } from "express"
import { validate } from "../../shared/http/validate"
import { verifyDataUser } from "../../middlewares/verifyDataUser"
import { bookingLimiter } from "../../middlewares/rateLimiters"
import { AuthMiddlewares } from "../auth/auth.middleware"
import { AppointmentController } from "./appointment.controller"
import {
    cancelAppointmentSchema,
    changeStatusSchema,
    checkOrderTimeSchema,
    companyHistoryQuerySchema,
    confirmAppointmentSchema,
} from "./appointment.schema"

export const createAppointmentRoutes = (
    appointmentController: AppointmentController,
    authMiddlewares: AuthMiddlewares
): Router => {
    const router = Router()
    const { authenticateTokenCompany } = authMiddlewares

    router.get("/get-appointment/:id", appointmentController.getById)
    router.post(
        "/add-appointment",
        bookingLimiter,
        verifyDataUser,
        validate(confirmAppointmentSchema),
        appointmentController.confirm
    )
    router.put(
        "/finish-appointment/:id",
        authenticateTokenCompany,
        appointmentController.finish
    )
    router.delete(
        "/cancel-appointment/:id",
        bookingLimiter,
        validate(cancelAppointmentSchema),
        appointmentController.cancelByClient
    )
    router.delete(
        "/delete-appointment/:id",
        authenticateTokenCompany,
        appointmentController.deleteByCompany
    )
    router.get(
        "/company-history/:companyId",
        authenticateTokenCompany,
        validate(companyHistoryQuerySchema, "query"),
        appointmentController.getCompanyHistory
    )
    router.post(
        "/check-booking-hour",
        validate(checkOrderTimeSchema),
        appointmentController.checkOrderTime
    )
    router.put(
        "/change-status",
        authenticateTokenCompany,
        validate(changeStatusSchema),
        appointmentController.changeStatus
    )

    return router
}
