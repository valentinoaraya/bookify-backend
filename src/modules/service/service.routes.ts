import { Router } from "express"
import { validate } from "../../shared/http/validate"
import { AuthMiddlewares } from "../auth/auth.middleware"
import {
    ServiceController,
    createVerifyServiceMiddleware,
} from "./service.controller"
import { ServiceService } from "./service.service"
import {
    createServiceSchema,
    enableSlotsSchema,
    slotDateSchema,
    updateServiceSchema,
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
    // Importante: ruta específica ANTES de /:id
    router.get("/contains-sign-price/:id", serviceController.containsSignPrice)
    router.get("/:id", serviceController.getById)

    return router
}
