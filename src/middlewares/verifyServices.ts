/**
 * Compatibilidad: ownership check ahora en ServiceService.assertCompanyOwnsService.
 */
import { composition } from "../composition"
import { createVerifyServiceMiddleware } from "../modules/service/service.controller"

const verifyService = createVerifyServiceMiddleware(composition.serviceService)
export default verifyService
