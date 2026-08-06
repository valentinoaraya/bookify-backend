import { Router } from "express"
import { validate } from "../../shared/http/validate"
import { AuthMiddlewares } from "../auth/auth.middleware"
import {
    ServiceController,
    createVerifyServiceMiddleware,
} from "./service.controller"
import { ServiceService } from "./service.service"
import {
    clearAvailableByDaySchema,
    clearAvailableByDatetimesSchema,
    createServiceSchema,
    enableSlotsSchema,
    slotDateSchema,
    updateServiceSchema,
    updateWorkScheduleSchema,
} from "./service.schema"

export const createServiceRoutes = (
    serviceController: ServiceController,
    serviceService: ServiceService,
    authMiddlewares: AuthMiddlewares
): Router => {
    const router = Router()
    const { authenticateTokenCompany } = authMiddlewares
    const verifyService = createVerifyServiceMiddleware(serviceService)

    router.post(
        "/create-service",
        authenticateTokenCompany,
        validate(createServiceSchema),
        serviceController.create
    )
    router.put(
        "/edit-service/:id",
        authenticateTokenCompany,
        verifyService,
        validate(updateServiceSchema),
        serviceController.edit
    )
    router.delete(
        "/delete-service/:id",
        authenticateTokenCompany,
        verifyService,
        serviceController.delete
    )
    router.post(
        "/enable-appointments/:id",
        authenticateTokenCompany,
        verifyService,
        validate(enableSlotsSchema),
        serviceController.enableSlots
    )
    router.post(
        "/add-enable-appointment/:id",
        authenticateTokenCompany,
        verifyService,
        validate(slotDateSchema),
        serviceController.addEnableAppointment
    )
    router.delete(
        "/delete-appointment/:id",
        authenticateTokenCompany,
        verifyService,
        validate(slotDateSchema),
        serviceController.deleteEnabledAppointment
    )
    router.delete(
        "/:id/available-slots-by-day",
        authenticateTokenCompany,
        verifyService,
        validate(clearAvailableByDaySchema),
        serviceController.clearAvailableSlotsByDay
    )
    router.delete(
        "/:id/available-slots",
        authenticateTokenCompany,
        verifyService,
        validate(clearAvailableByDatetimesSchema),
        serviceController.clearAvailableSlotsByDatetimes
    )
    router.put(
        "/:id/work-schedule",
        authenticateTokenCompany,
        verifyService,
        validate(updateWorkScheduleSchema),
        serviceController.updateWorkSchedule
    )
    router.post(
        "/:id/work-schedule/sync",
        authenticateTokenCompany,
        verifyService,
        serviceController.syncWorkSchedule
    )
    // Importante: ruta específica ANTES de /:id
    router.get("/contains-sign-price/:id", serviceController.containsSignPrice)
    router.get("/:id", serviceController.getById)

    return router
}
