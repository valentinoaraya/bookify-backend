import moment from "moment-timezone"
import { AvailableAppointmentInString } from "../../types"
import { WorkSchedule, WorkScheduleBlock } from "./service.types"

/** Generación manual (días concretos + un solo rango). Step = turnEach. */
export const generateAppointments = (body: {
    hourStart: string
    hourFinish: string
    turnEach: string
    days: string[]
    capacityPerShift: number
}): AvailableAppointmentInString[] => {
    const { hourStart, hourFinish, turnEach, days, capacityPerShift } = body
    const turnEachMinutes = parseInt(turnEach, 10)
    const availableAppointments: AvailableAppointmentInString[] = []
    days.forEach((day) => {
        let currentTime = moment(day).set({
            hour: parseInt(hourStart.split(":")[0], 10),
            minute: parseInt(hourStart.split(":")[1], 10),
            second: 0,
            millisecond: 0,
        })
        const endTime = moment(day).set({
            hour: parseInt(hourFinish.split(":")[0], 10),
            minute: parseInt(hourFinish.split(":")[1], 10),
            second: 0,
            millisecond: 0,
        })

        while (currentTime.isBefore(endTime) || currentTime.isSame(endTime)) {
            availableAppointments.push({
                datetime: currentTime.format("YYYY-MM-DD HH:mm"),
                capacity: capacityPerShift,
                taken: 0,
            })
            currentTime.add(turnEachMinutes, "minutes")
        }
    })

    return availableAppointments
}

const parseHm = (hm: string) => {
    const [hour, minute] = hm.split(":").map((n) => parseInt(n, 10))
    return { hour, minute }
}

/** Genera slots de un día para un bloque: step = interval + grace; el turno debe caber en el bloque. */
export const generateSlotsForBlock = (
    day: string,
    block: WorkScheduleBlock,
    turnIntervalMinutes: number,
    graceMinutes: number,
    capacityPerShift: number
): AvailableAppointmentInString[] => {
    const { hour: startH, minute: startM } = parseHm(block.start)
    const { hour: endH, minute: endM } = parseHm(block.end)
    const step = turnIntervalMinutes + graceMinutes

    let currentTime = moment(day, "YYYY-MM-DD").set({
        hour: startH,
        minute: startM,
        second: 0,
        millisecond: 0,
    })
    const endTime = moment(day, "YYYY-MM-DD").set({
        hour: endH,
        minute: endM,
        second: 0,
        millisecond: 0,
    })

    const result: AvailableAppointmentInString[] = []
    while (
        currentTime
            .clone()
            .add(turnIntervalMinutes, "minutes")
            .isSameOrBefore(endTime)
    ) {
        result.push({
            datetime: currentTime.format("YYYY-MM-DD HH:mm"),
            capacity: capacityPerShift,
            taken: 0,
        })
        currentTime.add(step, "minutes")
    }
    return result
}

/**
 * Genera turnos desde una plantilla semanal sobre un rango de fechas [fromDay, toDayExclusive).
 * days de la plantilla: 0=domingo … 6=sábado (moment.day()).
 */
export const generateAppointmentsFromSchedule = (body: {
    schedule: WorkSchedule
    fromDay: string
    toDayExclusive: string
    capacityPerShift: number
}): AvailableAppointmentInString[] => {
    const { schedule, fromDay, toDayExclusive, capacityPerShift } = body
    const daySet = new Set(schedule.days)
    const result: AvailableAppointmentInString[] = []

    const cursor = moment(fromDay, "YYYY-MM-DD").startOf("day")
    const end = moment(toDayExclusive, "YYYY-MM-DD").startOf("day")

    while (cursor.isBefore(end)) {
        if (daySet.has(cursor.day())) {
            const dayStr = cursor.format("YYYY-MM-DD")
            for (const block of schedule.blocks) {
                result.push(
                    ...generateSlotsForBlock(
                        dayStr,
                        block,
                        schedule.turnIntervalMinutes,
                        schedule.graceMinutes,
                        capacityPerShift
                    )
                )
            }
        }
        cursor.add(1, "day")
    }

    return result
}
