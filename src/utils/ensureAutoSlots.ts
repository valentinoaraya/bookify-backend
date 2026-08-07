import cron from "node-cron"
import { CompanyRepository } from "../modules/company/company.repository"
import { PendingReservationRepository } from "../modules/pending-reservation/pending-reservation.repository"
import { ServiceRepository } from "../modules/service/service.repository"
import { ServiceService } from "../modules/service/service.service"
import { SlotRepository } from "../modules/slot/slot.repository"
import { SubscriptionRepository } from "../modules/subscription/subscription.repository"

const serviceService = new ServiceService(
    new ServiceRepository(),
    new CompanyRepository(),
    new SlotRepository(),
    new SubscriptionRepository(),
    new PendingReservationRepository()
)

/**
 * Extiende la ventana rolling de slots auto (hoy → hoy+slotsVisibilityDays)
 * y poda slots auto vacíos fuera de la plantilla/horizonte.
 */
const syncAutoSlots = async () => {
    try {
        console.log("⏳ Sincronizando turnos automáticos...")
        const synced = await serviceService.ensureAutoSlotsForAllCompanies()
        console.log(`✏️  ${synced} servicio(s) con auto-generación sincronizados.`)
    } catch (error) {
        console.error("❌ Error al sincronizar turnos automáticos:", error)
    }
}

export const startEnsureAutoSlots = () => {
    // Tras la limpieza de medianoche, a las 00:05 BA
    cron.schedule(
        "5 0 * * *",
        async () => {
            await syncAutoSlots()
        },
        {
            timezone: "America/Argentina/Buenos_Aires",
        }
    )
}
