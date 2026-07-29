import { describe, it, expect, vi, beforeEach } from "vitest"
import { Types } from "mongoose"
import { AppointmentService } from "@/modules/appointment/appointment.service"
import { AppointmentRepository } from "@/modules/appointment/appointment.repository"
import { ServiceRepository } from "@/modules/service/service.repository"
import { CompanyRepository } from "@/modules/company/company.repository"
import { NotificationService } from "@/modules/notification/notification.service"
import { PendingSlotService } from "@/modules/appointment/pending-slot.service"
import { MercadoPagoPaymentGateway } from "@/modules/payment/refund.gateway"
import { PaymentRepository } from "@/modules/payment/payment.repository"
import { SlotRepository } from "@/modules/slot/slot.repository"
import { ValidationError, NotFoundError } from "@/shared/errors"

describe("AppointmentService", () => {
    const companyId = new Types.ObjectId()
    let appointmentRepository: Record<string, ReturnType<typeof vi.fn>>
    let serviceRepository: Record<string, ReturnType<typeof vi.fn>>
    let companyRepository: Record<string, ReturnType<typeof vi.fn>>
    let notificationService: Record<string, ReturnType<typeof vi.fn>>
    let pendingSlotService: Record<string, ReturnType<typeof vi.fn>>
    let paymentGateway: Record<string, ReturnType<typeof vi.fn>>
    let slotRepository: Record<string, ReturnType<typeof vi.fn>>
    let paymentRepository: Record<string, ReturnType<typeof vi.fn>>
    let appointmentService: AppointmentService

    beforeEach(() => {
        appointmentRepository = {
            create: vi.fn(),
            findLeanById: vi.fn(),
            findById: vi.fn(),
            updateById: vi.fn(),
            findScheduledByService: vi.fn(),
            setServiceInfoSnapshot: vi.fn(),
        }
        serviceRepository = {
            findLeanById: vi.fn(),
            findById: vi.fn(),
        }
        companyRepository = {
            findById: vi.fn(),
            updateById: vi.fn(),
        }
        notificationService = {
            sendConfirmAppointment: vi.fn(),
            sendCancelByClient: vi.fn(),
            sendCancelByCompany: vi.fn(),
            sendRefundUnavailable: vi.fn(),
        }
        pendingSlotService = {
            isAvailable: vi.fn(),
            removePending: vi.fn(),
            markAsPending: vi.fn(),
        }
        paymentGateway = {
            refund: vi.fn(),
            getPayment: vi.fn(),
        }
        slotRepository = {
            tryReserveByServiceDatetime: vi.fn(),
            releaseOne: vi.fn(),
            releaseByServiceDatetime: vi.fn(),
            findAllByService: vi.fn().mockResolvedValue([]),
        }
        paymentRepository = {
            createIfAbsent: vi.fn(),
            linkAppointment: vi.fn(),
            updateStatus: vi.fn(),
        }

        appointmentService = new AppointmentService(
            appointmentRepository as unknown as AppointmentRepository,
            serviceRepository as unknown as ServiceRepository,
            companyRepository as unknown as CompanyRepository,
            notificationService as unknown as NotificationService,
            pendingSlotService as unknown as PendingSlotService,
            paymentGateway as unknown as MercadoPagoPaymentGateway,
            slotRepository as unknown as SlotRepository,
            paymentRepository as unknown as PaymentRepository
        )
    })

    it("checkOrderTime rechaza si no hay anticipación suficiente", async () => {
        companyRepository.findById.mockResolvedValue({
            _id: companyId,
            bookingAnticipationHours: 24,
        })

        await expect(
            appointmentService.checkOrderTime({
                companyId: companyId.toString(),
                date: new Date().toISOString(),
            })
        ).rejects.toBeInstanceOf(ValidationError)
    })

    it("changeStatus rechaza estados inválidos vía schema path - service valida finished/did_not_attend", async () => {
        await expect(
            appointmentService.changeStatus({
                appointmentId: "x",
                status: "cancelled" as any,
            })
        ).rejects.toBeInstanceOf(ValidationError)
    })

    it("getByRef lanza error si no existe", async () => {
        appointmentRepository.findLeanById.mockResolvedValue(null)
        await expect(
            appointmentService.getByRef({
                appointmentId: new Types.ObjectId().toString(),
                verified: true,
            })
        ).rejects.toBeInstanceOf(ValidationError)
    })

    it("findScheduledIdsByService mapea ids", async () => {
        const id = new Types.ObjectId()
        appointmentRepository.findScheduledByService.mockResolvedValue([
            { id: id.toString(), _id: id },
        ])
        const result = await appointmentService.findScheduledIdsByService("svc")
        expect(result[0]._id).toEqual(id)
    })
})
