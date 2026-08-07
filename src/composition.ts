import { CompanyRepository } from "./modules/company/company.repository"
import { AuthService } from "./modules/auth/auth.service"
import { createAuthMiddlewares } from "./modules/auth/auth.middleware"
import { CompanyService } from "./modules/company/company.service"
import { CompanyController } from "./modules/company/company.controller"
import { createCompanyRoutes } from "./modules/company/company.routes"
import { MercadoPagoSubscriptionGateway } from "./infrastructure/mercadopago/subscription.gateway"
import { EmailGateway } from "./infrastructure/email/email.gateway"
import { NotificationService } from "./modules/notification/notification.service"
import { ServiceRepository } from "./modules/service/service.repository"
import { ServiceService } from "./modules/service/service.service"
import { ServiceController } from "./modules/service/service.controller"
import { createServiceRoutes } from "./modules/service/service.routes"
import { SlotRepository } from "./modules/slot/slot.repository"
import { AppointmentRepository } from "./modules/appointment/appointment.repository"
import { PendingReservationRepository } from "./modules/pending-reservation/pending-reservation.repository"
import { PendingReservationService } from "./modules/pending-reservation/pending-reservation.service"
import { AppointmentService } from "./modules/appointment/appointment.service"
import { AppointmentController } from "./modules/appointment/appointment.controller"
import { createAppointmentRoutes } from "./modules/appointment/appointment.routes"
import { MercadoPagoPaymentGateway } from "./modules/payment/refund.gateway"
import { MpTokenService } from "./modules/payment/mp-token.service"
import { PaymentRepository } from "./modules/payment/payment.repository"
import { PaymentService } from "./modules/payment/payment.service"
import { PaymentController } from "./modules/payment/payment.controller"
import { createPaymentRoutes } from "./modules/payment/payment.routes"
import { SubscriptionRepository } from "./modules/subscription/subscription.repository"
import { SubscriptionService } from "./modules/subscription/subscription.service"
import { SubscriptionController } from "./modules/subscription/subscription.controller"
import { createSubscriptionRoutes } from "./modules/subscription/subscription.routes"

/**
 * Composition root: instancia manual de dependencias.
 */
const companyRepository = new CompanyRepository()
const serviceRepository = new ServiceRepository()
const appointmentRepository = new AppointmentRepository()
const slotRepository = new SlotRepository()
const pendingReservationRepository = new PendingReservationRepository()
const paymentRepository = new PaymentRepository()
const subscriptionRepository = new SubscriptionRepository()

const emailGateway = new EmailGateway()
const notificationService = new NotificationService(emailGateway)
const paymentGateway = new MercadoPagoPaymentGateway()
const mpTokenService = new MpTokenService(companyRepository, paymentGateway)
const mpSubscriptionGateway = new MercadoPagoSubscriptionGateway()

const authService = new AuthService(companyRepository)
const authMiddlewares = createAuthMiddlewares(authService)

const pendingSlotService = new PendingReservationService(
    pendingReservationRepository,
    slotRepository,
    serviceRepository
)

const appointmentService = new AppointmentService(
    appointmentRepository,
    serviceRepository,
    companyRepository,
    notificationService,
    pendingSlotService,
    paymentGateway,
    slotRepository,
    paymentRepository,
    mpTokenService
)

const companyService = new CompanyService(
    companyRepository,
    authService,
    mpSubscriptionGateway,
    subscriptionRepository,
    appointmentRepository,
    slotRepository,
    pendingReservationRepository,
    serviceRepository
)
const companyController = new CompanyController(companyService, authService)
const companyRoutes = createCompanyRoutes(companyController, authMiddlewares)

const serviceService = new ServiceService(
    serviceRepository,
    companyRepository,
    slotRepository,
    subscriptionRepository,
    pendingReservationRepository
)
serviceService.setAppointmentCleanup(appointmentService)

const serviceController = new ServiceController(serviceService)
const serviceRoutes = createServiceRoutes(
    serviceController,
    serviceService,
    authMiddlewares
)

const appointmentController = new AppointmentController(appointmentService)
const appointmentRoutes = createAppointmentRoutes(
    appointmentController,
    authMiddlewares
)

const subscriptionService = new SubscriptionService(
    companyRepository,
    serviceRepository,
    mpSubscriptionGateway,
    subscriptionRepository,
    notificationService
)
const subscriptionController = new SubscriptionController(subscriptionService)
const subscriptionRoutes = createSubscriptionRoutes(
    subscriptionController,
    authMiddlewares
)

const paymentService = new PaymentService(
    companyRepository,
    serviceRepository,
    paymentGateway,
    subscriptionService,
    subscriptionRepository,
    mpTokenService
)
paymentService.setAppointmentPort(appointmentService)

const paymentController = new PaymentController(paymentService, {
    markPending: (serviceId, date, userId, userData) =>
        pendingSlotService.markAsPending(serviceId, date, userId, userData),
    removePending: (serviceId, pendingId) =>
        pendingSlotService.removePending(serviceId, pendingId),
})
const paymentRoutes = createPaymentRoutes(paymentController, authMiddlewares)

export const composition = {
    companyRepository,
    serviceRepository,
    appointmentRepository,
    slotRepository,
    pendingReservationRepository,
    paymentRepository,
    subscriptionRepository,
    authService,
    authMiddlewares,
    notificationService,
    pendingSlotService,
    appointmentService,
    companyService,
    serviceService,
    paymentService,
    subscriptionService,
    companyRoutes,
    serviceRoutes,
    appointmentRoutes,
    paymentRoutes,
    subscriptionRoutes,
}

export const { authenticateTokenCompany, authenticateRefreshTokenCompany } =
    authMiddlewares
