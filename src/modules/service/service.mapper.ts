import { formatDateTime } from "../../shared/utils/datetime"
import { SlotMapper } from "../slot/slot.mapper"
import { SlotDocument } from "../slot/slot.types"
import { ServiceDocument } from "./service.types"

export class ServiceMapper {
    static withSlots(
        service: ServiceDocument | Record<string, any>,
        slots: Array<SlotDocument | Record<string, any>> = [],
        pendingAppointments: any[] = []
    ): Record<string, any> {
        const legacy = SlotMapper.toLegacyServiceFields(slots)
        return {
            ...service,
            slots: slots.map((s) => SlotMapper.toAvailableShape(s)),
            availableAppointments: legacy.availableAppointments,
            scheduledAppointments: legacy.scheduledAppointments,
            pendingAppointments: pendingAppointments.map((pending: any) => ({
                ...pending,
                datetime:
                    typeof pending.datetime === "string"
                        ? pending.datetime
                        : formatDateTime(pending.datetime),
            })),
        }
    }

    /** @deprecated Prefer withSlots */
    static withFormattedDates(service: ServiceDocument | Record<string, any>): Record<string, any> {
        const raw = service as Record<string, any>
        return {
            ...raw,
            availableAppointments: (raw.availableAppointments || []).map(
                (appointment: any) => ({
                    ...appointment,
                    datetime: formatDateTime(appointment.datetime),
                })
            ),
            scheduledAppointments: (raw.scheduledAppointments || []).map((date: any) =>
                formatDateTime(date)
            ),
            pendingAppointments: (raw.pendingAppointments || []).map((pending: any) => ({
                ...pending,
                datetime: formatDateTime(pending.datetime),
            })),
        }
    }
}
