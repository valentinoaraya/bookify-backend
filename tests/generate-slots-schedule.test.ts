import { describe, it, expect, vi, beforeEach } from "vitest"
import { Types } from "mongoose"
import moment from "moment-timezone"
import {
    generateAppointmentsFromSchedule,
    generateSlotsForBlock,
} from "@/modules/service/generate-slots"
import { ServiceService } from "@/modules/service/service.service"
import { ServiceRepository } from "@/modules/service/service.repository"
import { CompanyRepository } from "@/modules/company/company.repository"
import { PendingReservationRepository } from "@/modules/pending-reservation/pending-reservation.repository"
import { SlotRepository } from "@/modules/slot/slot.repository"
import { SubscriptionRepository } from "@/modules/subscription/subscription.repository"
import { BA_TIMEZONE } from "@/shared/utils/datetime"

describe("generate-slots (schedule + grace)", () => {
    it("usa interval + grace como distancia entre turnos", () => {
        const slots = generateSlotsForBlock(
            "2030-01-07", // lunes
            { start: "09:00", end: "12:00" },
            50,
            10,
            1
        )
        expect(slots.map((s) => s.datetime)).toEqual([
            "2030-01-07 09:00",
            "2030-01-07 10:00",
            "2030-01-07 11:00",
        ])
    })

    it("no genera un turno si el intervalo no cabe en el bloque", () => {
        const slots = generateSlotsForBlock(
            "2030-01-07",
            { start: "09:00", end: "10:00" },
            60,
            0,
            1
        )
        expect(slots.map((s) => s.datetime)).toEqual(["2030-01-07 09:00"])
    })

    it("soporta múltiples bloques el mismo día", () => {
        const slots = generateAppointmentsFromSchedule({
            schedule: {
                days: [1],
                blocks: [
                    { start: "09:00", end: "10:00" },
                    { start: "15:00", end: "16:00" },
                ],
                turnIntervalMinutes: 30,
                graceMinutes: 0,
            },
            fromDay: "2030-01-07",
            toDayExclusive: "2030-01-08",
            capacityPerShift: 2,
        })
        expect(slots.map((s) => s.datetime)).toEqual([
            "2030-01-07 09:00",
            "2030-01-07 09:30",
            "2030-01-07 15:00",
            "2030-01-07 15:30",
        ])
        expect(slots.every((s) => s.capacity === 2)).toBe(true)
    })

    it("solo genera en los weekdays de la plantilla", () => {
        // 2030-01-06 domingo … 2030-01-12 sábado
        const slots = generateAppointmentsFromSchedule({
            schedule: {
                days: [1, 3], // lun y mié
                blocks: [{ start: "10:00", end: "11:00" }],
                turnIntervalMinutes: 60,
                graceMinutes: 0,
            },
            fromDay: "2030-01-06",
            toDayExclusive: "2030-01-13",
            capacityPerShift: 1,
        })
        expect(slots.map((s) => s.datetime)).toEqual([
            "2030-01-07 10:00",
            "2030-01-09 10:00",
        ])
    })
})

describe("ServiceService.ensureAutoSlotsForService", () => {
    const serviceId = new Types.ObjectId()
    const companyId = new Types.ObjectId()

    let serviceRepository: {
        findLeanById: ReturnType<typeof vi.fn>
        findAutoGenerateActive: ReturnType<typeof vi.fn>
        setFields: ReturnType<typeof vi.fn>
    }
    let companyRepository: {
        findById: ReturnType<typeof vi.fn>
    }
    let slotRepository: {
        syncAutoSlots: ReturnType<typeof vi.fn>
        deleteEmptyAutoSlotsNotMatching: ReturnType<typeof vi.fn>
        deleteEmptyFutureAutoSlots: ReturnType<typeof vi.fn>
        findAllByService: ReturnType<typeof vi.fn>
    }
    let pendingReservationRepository: {
        findActiveByService: ReturnType<typeof vi.fn>
    }
    let serviceService: ServiceService

    beforeEach(() => {
        serviceRepository = {
            findLeanById: vi.fn(),
            findAutoGenerateActive: vi.fn(),
            setFields: vi.fn(),
        }
        companyRepository = {
            findById: vi.fn(),
        }
        slotRepository = {
            syncAutoSlots: vi.fn().mockResolvedValue({ inserted: 1, updated: 0 }),
            deleteEmptyAutoSlotsNotMatching: vi.fn().mockResolvedValue(0),
            deleteEmptyFutureAutoSlots: vi.fn().mockResolvedValue(0),
            findAllByService: vi.fn().mockResolvedValue([]),
        }
        pendingReservationRepository = {
            findActiveByService: vi.fn().mockResolvedValue([]),
        }
        serviceService = new ServiceService(
            serviceRepository as unknown as ServiceRepository,
            companyRepository as unknown as CompanyRepository,
            slotRepository as unknown as SlotRepository,
            {} as SubscriptionRepository,
            pendingReservationRepository as unknown as PendingReservationRepository
        )
    })

    it("sincroniza slots auto según plantilla y horizonte de la empresa", async () => {
        serviceRepository.findLeanById.mockResolvedValue({
            _id: serviceId,
            companyId,
            capacityPerShift: 1,
            autoGenerateSlots: true,
            workSchedule: {
                days: [1, 2, 3, 4, 5],
                blocks: [{ start: "09:00", end: "10:00" }],
                turnIntervalMinutes: 60,
                graceMinutes: 0,
            },
        })
        companyRepository.findById.mockResolvedValue({
            _id: companyId,
            slotsVisibilityDays: 7,
        })

        await serviceService.ensureAutoSlotsForService(String(serviceId))

        expect(slotRepository.syncAutoSlots).toHaveBeenCalled()
        const syncedSlots = slotRepository.syncAutoSlots.mock.calls[0][0]
        expect(syncedSlots.length).toBeGreaterThan(0)
        expect(syncedSlots.every((s: { source: string }) => s.source === "auto")).toBe(
            true
        )
        expect(slotRepository.deleteEmptyAutoSlotsNotMatching).toHaveBeenCalledWith(
            expect.objectContaining({
                serviceId: String(serviceId),
                excludeIds: [],
            })
        )
    })

    it("no hace nada si autoGenerateSlots está apagado", async () => {
        serviceRepository.findLeanById.mockResolvedValue({
            _id: serviceId,
            companyId,
            autoGenerateSlots: false,
            workSchedule: {
                days: [1],
                blocks: [{ start: "09:00", end: "10:00" }],
                turnIntervalMinutes: 30,
                graceMinutes: 0,
            },
        })

        await serviceService.ensureAutoSlotsForService(String(serviceId))

        expect(slotRepository.syncAutoSlots).not.toHaveBeenCalled()
    })

    it("al desactivar auto borra futuros vacíos pero excluye slots con hold", async () => {
        const holdSlotId = new Types.ObjectId()
        serviceRepository.findLeanById.mockResolvedValue({
            _id: serviceId,
            companyId,
            autoGenerateSlots: true,
            workSchedule: {
                days: [1],
                blocks: [{ start: "09:00", end: "10:00" }],
                turnIntervalMinutes: 30,
                graceMinutes: 0,
            },
        })
        serviceRepository.setFields.mockResolvedValue({
            _id: serviceId,
            companyId,
            autoGenerateSlots: false,
            workSchedule: {
                days: [1],
                blocks: [{ start: "09:00", end: "10:00" }],
                turnIntervalMinutes: 30,
                graceMinutes: 0,
            },
        })
        pendingReservationRepository.findActiveByService.mockResolvedValue([
            { slotId: holdSlotId },
        ])

        await serviceService.updateWorkSchedule(String(serviceId), {
            workSchedule: {
                days: [1],
                blocks: [{ start: "09:00", end: "10:00" }],
                turnIntervalMinutes: 30,
                graceMinutes: 0,
            },
            autoGenerateSlots: false,
        })

        expect(slotRepository.deleteEmptyFutureAutoSlots).toHaveBeenCalledWith(
            String(serviceId),
            expect.any(Date),
            [holdSlotId]
        )
        expect(slotRepository.syncAutoSlots).not.toHaveBeenCalled()
    })
})

describe("SlotRepository.syncAutoSlots (unit)", () => {
    it("no inserta ni actualiza slots manuales existentes", async () => {
        const serviceId = new Types.ObjectId()
        const companyId = new Types.ObjectId()
        const datetime = moment
            .tz("2030-01-07 09:00", "YYYY-MM-DD HH:mm", BA_TIMEZONE)
            .toDate()

        const repo = new SlotRepository()
        const find = vi.fn().mockReturnValue({
            lean: () => ({
                exec: () =>
                    Promise.resolve([
                        {
                            _id: new Types.ObjectId(),
                            serviceId,
                            datetime,
                            capacity: 2,
                            taken: 0,
                            source: "manual",
                        },
                    ]),
            }),
        })
        const insertMany = vi.fn()
        const bulkWrite = vi.fn()
        ;(repo as any).model = { find, insertMany, bulkWrite }

        const result = await repo.syncAutoSlots([
            {
                serviceId,
                companyId,
                datetime,
                capacity: 1,
                source: "auto",
            },
        ])

        expect(result).toEqual({ inserted: 0, updated: 0 })
        expect(insertMany).not.toHaveBeenCalled()
        expect(bulkWrite).not.toHaveBeenCalled()
    })
})
