import { formatDateTime } from "../../shared/utils/datetime"
import { SlotDocument } from "./slot.types"

export class SlotMapper {
    static toAvailableShape(slot: SlotDocument | Record<string, any>) {
        return {
            _id: slot._id,
            datetime: formatDateTime(slot.datetime),
            capacity: slot.capacity,
            taken: slot.taken,
        }
    }

    static toAvailableList(slots: Array<SlotDocument | Record<string, any>>) {
        return slots
            .filter((s) => s.taken < s.capacity)
            .map((s) => this.toAvailableShape(s))
    }

    static toLegacyServiceFields(slots: Array<SlotDocument | Record<string, any>>) {
        const availableAppointments = this.toAvailableList(slots)
        const scheduledAppointments: string[] = []
        for (const slot of slots) {
            for (let i = 0; i < (slot.taken || 0); i++) {
                scheduledAppointments.push(formatDateTime(slot.datetime))
            }
        }
        return { availableAppointments, scheduledAppointments }
    }
}
