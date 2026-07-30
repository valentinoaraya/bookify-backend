import { describe, it, expect, vi, beforeEach } from "vitest"
import { Types } from "mongoose"
import { AppointmentService } from "@/modules/appointment/appointment.service"
import { AppointmentRepository } from "@/modules/appointment/appointment.repository"
import { ServiceRepository } from "@/modules/service/service.repository"
import { CompanyRepository } from "@/modules/company/company.repository"
import { NotificationService } from "@/modules/notification/notification.service"
import { PendingReservationService } from "@/modules/pending-reservation/pending-reservation.service"
import { MercadoPagoPaymentGateway } from "@/modules/payment/refund.gateway"
import { PaymentRepository } from "@/modules/payment/payment.repository"
import { SlotRepository } from "@/modules/slot/slot.repository"
import { ForbiddenError, UnauthorizedError, ValidationError } from "@/shared/errors"
import {
    resolveAppointmentRef,
    signCancelToken,
    verifyCancelToken,
} from "@/modules/appointment/cancel-token"

vi.mock("@/shared/database/withTransaction", () => ({
    withTransaction: async (fn: (session: null) => Promise<unknown>) => fn(null),
}))

vi.mock("@/infrastructure/realtime/socket", () => ({
    getIO: () => ({ to: () => ({ emit: vi.fn() }) }),
}))

vi.mock("@/queues/reminderQueue", () => ({
    reminderQueue: { getJob: vi.fn().mockResolvedValue(null) },
}))

vi.mock("@/utils/scheduleRemindersForAppointment", () => ({
    scheduleRemindersForAppointment: vi.fn(),
}))

const inTwoDays = () => new Date(Date.now() + 48 * 60 * 60 * 1000)

describe("Seguridad del flujo de turnos", () => {
    const companyId = new Types.ObjectId()
    const otherCompanyId = new Types.ObjectId()
    const serviceId = new Types.ObjectId()
    const appointmentId = new Types.ObjectId()

    let appointmentRepository: Record<string, ReturnType<typeof vi.fn>>
    let serviceRepository: Record<string, ReturnType<typeof vi.fn>>
    let companyRepository: Record<string, ReturnType<typeof vi.fn>>
    let notificationService: Record<string, ReturnType<typeof vi.fn>>
    let pendingSlotService: Record<string, ReturnType<typeof vi.fn>>
    let paymentGateway: Record<string, ReturnType<typeof vi.fn>>
    let slotRepository: Record<string, ReturnType<typeof vi.fn>>
    let paymentRepository: Record<string, ReturnType<typeof vi.fn>>
    let appointmentService: AppointmentService

    const userData = {
        name: "Ana",
        lastName: "Gómez",
        email: "ana@example.com",
        dni: "30111222",
        phone: "1122334455",
    }

    const scheduledAppointment = () => ({
        _id: appointmentId,
        companyId,
        serviceId,
        slotId: new Types.ObjectId(),
        name: "Ana",
        lastName: "Gómez",
        email: "ana@example.com",
        status: "scheduled",
        date: inTwoDays(),
        reminderJobs: [],
        mode: "in-person",
    })

    beforeEach(() => {
        appointmentRepository = {
            createWithSession: vi.fn(),
            findLeanById: vi.fn(),
            findLeanByIdPopulated: vi.fn(),
            cancelIfScheduled: vi.fn(),
            updateById: vi.fn(),
        }
        serviceRepository = {
            findLeanById: vi.fn(),
            findById: vi.fn(),
        }
        companyRepository = {
            findById: vi.fn().mockResolvedValue({
                _id: companyId,
                name: "Peluquería",
                email: "co@example.com",
                mp_access_token: "token",
                bookingAnticipationHours: 0,
                cancellationAnticipationHours: 0,
            }),
        }
        notificationService = {
            sendConfirmAppointment: vi.fn(),
            sendCancelByClient: vi.fn(),
            sendCancelByCompany: vi.fn(),
        }
        pendingSlotService = {
            isAvailable: vi.fn().mockResolvedValue(true),
            removePending: vi.fn(),
            deletePending: vi.fn(),
            notifyServiceUpdated: vi.fn(),
            getById: vi.fn().mockResolvedValue(null),
        }
        paymentGateway = { refund: vi.fn(), getPayment: vi.fn() }
        slotRepository = {
            tryReserveByServiceDatetime: vi.fn(),
            releaseOne: vi.fn().mockResolvedValue(true),
            findAllByService: vi.fn().mockResolvedValue([]),
            findById: vi.fn(),
        }
        paymentRepository = {
            findByMpPaymentId: vi.fn(),
            findById: vi.fn(),
            updateStatus: vi.fn(),
            markRefunded: vi.fn(),
        }

        appointmentService = new AppointmentService(
            appointmentRepository as unknown as AppointmentRepository,
            serviceRepository as unknown as ServiceRepository,
            companyRepository as unknown as CompanyRepository,
            notificationService as unknown as NotificationService,
            pendingSlotService as unknown as PendingReservationService,
            paymentGateway as unknown as MercadoPagoPaymentGateway,
            slotRepository as unknown as SlotRepository,
            paymentRepository as unknown as PaymentRepository
        )
    })

    describe("seña obligatoria", () => {
        it("rechaza reservar un servicio con seña sin pago asociado", async () => {
            serviceRepository.findLeanById.mockResolvedValue({
                _id: serviceId,
                companyId,
                title: "Corte",
                price: 10000,
                signPrice: 3000,
                duration: 30,
                mode: "in-person",
                active: true,
            })

            await expect(
                appointmentService.createAppointment(
                    companyId.toString(),
                    serviceId.toString(),
                    inTwoDays(),
                    userData
                )
            ).rejects.toBeInstanceOf(ValidationError)

            expect(slotRepository.tryReserveByServiceDatetime).not.toHaveBeenCalled()
        })

        it("permite reservar un servicio sin seña", async () => {
            serviceRepository.findLeanById.mockResolvedValue({
                _id: serviceId,
                companyId,
                title: "Corte",
                price: 10000,
                signPrice: 0,
                duration: 30,
                mode: "in-person",
                active: true,
            })
            slotRepository.tryReserveByServiceDatetime.mockResolvedValue({
                _id: new Types.ObjectId(),
            })
            appointmentRepository.createWithSession.mockResolvedValue({
                ...scheduledAppointment(),
                id: appointmentId.toString(),
            })
            appointmentRepository.findLeanByIdPopulated.mockResolvedValue({
                ...scheduledAppointment(),
                serviceId: { title: "Corte" },
                companyId: { name: "Peluquería" },
            })

            await appointmentService.createAppointment(
                companyId.toString(),
                serviceId.toString(),
                inTwoDays(),
                userData
            )

            expect(slotRepository.tryReserveByServiceDatetime).toHaveBeenCalled()
        })

        it("rechaza reservar un servicio desactivado", async () => {
            serviceRepository.findLeanById.mockResolvedValue({
                _id: serviceId,
                companyId,
                title: "Corte",
                price: 10000,
                signPrice: 0,
                duration: 30,
                mode: "in-person",
                active: false,
            })

            await expect(
                appointmentService.createAppointment(
                    companyId.toString(),
                    serviceId.toString(),
                    inTwoDays(),
                    userData
                )
            ).rejects.toBeInstanceOf(ValidationError)
        })

        it("rechaza reservar un horario que ya pasó", async () => {
            serviceRepository.findLeanById.mockResolvedValue({
                _id: serviceId,
                companyId,
                title: "Corte",
                signPrice: 0,
                duration: 30,
                mode: "in-person",
                active: true,
            })

            await expect(
                appointmentService.createAppointment(
                    companyId.toString(),
                    serviceId.toString(),
                    new Date(Date.now() - 60 * 60 * 1000),
                    userData
                )
            ).rejects.toBeInstanceOf(ValidationError)
        })
    })

    describe("token de cancelación", () => {
        it("un token válido resuelve el turno como verificado", () => {
            const token = signCancelToken(appointmentId, inTwoDays())
            expect(verifyCancelToken(token)).toBe(appointmentId.toString())
            expect(resolveAppointmentRef(token)).toEqual({
                appointmentId: appointmentId.toString(),
                verified: true,
            })
        })

        it("un id crudo resuelve como no verificado", () => {
            expect(resolveAppointmentRef(appointmentId.toString())).toEqual({
                appointmentId: appointmentId.toString(),
                verified: false,
            })
        })

        it("rechaza tokens manipulados y referencias inválidas", () => {
            const token = signCancelToken(appointmentId, inTwoDays())
            expect(verifyCancelToken(`${token}x`)).toBeNull()
            expect(resolveAppointmentRef("no-es-un-id")).toBeNull()
        })
    })

    describe("cancelación por el cliente", () => {
        it("con link viejo, rechaza si el email no coincide", async () => {
            appointmentRepository.findLeanById.mockResolvedValue(scheduledAppointment())

            await expect(
                appointmentService.cancelByClient(
                    { appointmentId: appointmentId.toString(), verified: false },
                    "atacante@example.com"
                )
            ).rejects.toBeInstanceOf(UnauthorizedError)

            expect(appointmentRepository.cancelIfScheduled).not.toHaveBeenCalled()
        })

        it("con link viejo, rechaza si no se envía email", async () => {
            appointmentRepository.findLeanById.mockResolvedValue(scheduledAppointment())

            await expect(
                appointmentService.cancelByClient({
                    appointmentId: appointmentId.toString(),
                    verified: false,
                })
            ).rejects.toBeInstanceOf(UnauthorizedError)
        })

        it("con token firmado, no pide email", async () => {
            appointmentRepository.findLeanById.mockResolvedValue(scheduledAppointment())
            serviceRepository.findLeanById.mockResolvedValue({
                _id: serviceId,
                title: "Corte",
                signPrice: 0,
            })
            appointmentRepository.cancelIfScheduled.mockResolvedValue(
                scheduledAppointment()
            )

            await appointmentService.cancelByClient({
                appointmentId: appointmentId.toString(),
                verified: true,
            })

            expect(appointmentRepository.cancelIfScheduled).toHaveBeenCalledWith(
                appointmentId,
                "client",
                expect.anything()
            )
        })

        it("no cancela dos veces el mismo turno", async () => {
            appointmentRepository.findLeanById.mockResolvedValue(scheduledAppointment())
            serviceRepository.findLeanById.mockResolvedValue({
                _id: serviceId,
                title: "Corte",
                signPrice: 0,
            })
            // Segunda cancelación: el filtro por estado `scheduled` no encuentra nada.
            appointmentRepository.cancelIfScheduled.mockResolvedValue(null)

            await expect(
                appointmentService.cancelByClient({
                    appointmentId: appointmentId.toString(),
                    verified: true,
                })
            ).rejects.toBeInstanceOf(ValidationError)

            expect(slotRepository.releaseOne).not.toHaveBeenCalled()
            expect(paymentGateway.refund).not.toHaveBeenCalled()
        })

        it("el reembolso se pide después de liberar el turno", async () => {
            const appointment = {
                ...scheduledAppointment(),
                paymentId: "mp-1",
                totalPaidAmount: 1000,
            }
            appointmentRepository.findLeanById.mockResolvedValue(appointment)
            serviceRepository.findLeanById.mockResolvedValue({
                _id: serviceId,
                title: "Corte",
                signPrice: 500,
            })
            appointmentRepository.cancelIfScheduled.mockResolvedValue(appointment)
            paymentRepository.findByMpPaymentId.mockResolvedValue({
                _id: new Types.ObjectId(),
                amount: 1000,
            })
            paymentGateway.refund.mockResolvedValue({ id: "refund-1" })

            await appointmentService.cancelByClient({
                appointmentId: appointmentId.toString(),
                verified: true,
            })

            expect(paymentGateway.refund).toHaveBeenCalledWith("mp-1", "token", 500)
            expect(paymentRepository.markRefunded).toHaveBeenCalled()
        })

        it("si el reembolso falla, el turno queda cancelado y el pago pendiente", async () => {
            const paymentDocId = new Types.ObjectId()
            const appointment = {
                ...scheduledAppointment(),
                paymentId: "mp-2",
                totalPaidAmount: 1000,
            }
            appointmentRepository.findLeanById.mockResolvedValue(appointment)
            serviceRepository.findLeanById.mockResolvedValue({
                _id: serviceId,
                title: "Corte",
                signPrice: 500,
            })
            appointmentRepository.cancelIfScheduled.mockResolvedValue(appointment)
            paymentRepository.findByMpPaymentId.mockResolvedValue({
                _id: paymentDocId,
                amount: 1000,
            })
            paymentGateway.refund.mockResolvedValue(null)

            await appointmentService.cancelByClient({
                appointmentId: appointmentId.toString(),
                verified: true,
            })

            expect(appointmentRepository.cancelIfScheduled).toHaveBeenCalled()
            expect(paymentRepository.updateStatus).toHaveBeenCalledWith(
                paymentDocId,
                "refund_pending"
            )
        })
    })

    describe("aislamiento entre empresas", () => {
        it("deleteByCompany rechaza un turno de otra empresa", async () => {
            appointmentRepository.findLeanById.mockResolvedValue(scheduledAppointment())

            await expect(
                appointmentService.deleteByCompany(
                    appointmentId.toString(),
                    otherCompanyId.toString(),
                    "Otra",
                    "otra@example.com"
                )
            ).rejects.toBeInstanceOf(ForbiddenError)
        })

        it("finish rechaza un turno de otra empresa", async () => {
            appointmentRepository.findLeanById.mockResolvedValue(scheduledAppointment())

            await expect(
                appointmentService.finish(
                    appointmentId.toString(),
                    otherCompanyId.toString()
                )
            ).rejects.toBeInstanceOf(ForbiddenError)
        })

        it("changeStatus rechaza un turno de otra empresa", async () => {
            appointmentRepository.findLeanById.mockResolvedValue(scheduledAppointment())

            await expect(
                appointmentService.changeStatus(
                    {
                        appointmentId: appointmentId.toString(),
                        status: "did_not_attend",
                    },
                    otherCompanyId.toString()
                )
            ).rejects.toBeInstanceOf(ForbiddenError)
        })

        it("changeStatus no reabre un turno cancelado", async () => {
            appointmentRepository.findLeanById.mockResolvedValue({
                ...scheduledAppointment(),
                status: "cancelled",
            })

            await expect(
                appointmentService.changeStatus(
                    {
                        appointmentId: appointmentId.toString(),
                        status: "finished",
                    },
                    companyId.toString()
                )
            ).rejects.toBeInstanceOf(ValidationError)
        })
    })
})
