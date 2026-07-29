import { z } from "zod"

export const confirmAppointmentSchema = z.object({
    dataAppointment: z.object({
        date: z.string().min(1, "Fecha requerida"),
        serviceId: z.string().min(1, "Servicio requerido"),
        companyId: z.string().min(1, "Empresa requerida"),
    }),
    dataUser: z
        .object({
            name: z.string().optional(),
            lastName: z.string().optional(),
            email: z.string().optional(),
            phone: z.string().optional(),
            dni: z.union([z.string(), z.number()]).optional(),
            userLocation: z.string().optional(),
        })
        .passthrough()
        .optional(),
})

/**
 * La cancelación no crea nada, así que no pide los datos completos del turno.
 * El email solo es necesario para los links viejos sin firmar.
 */
export const cancelAppointmentSchema = z.object({
    dataUser: z
        .object({ email: z.string().optional() })
        .passthrough()
        .optional(),
})

export const checkOrderTimeSchema = z.object({
    companyId: z.string().min(1, "Empresa requerida"),
    date: z.union([z.string(), z.date()]),
})

export const changeStatusSchema = z.object({
    appointmentId: z.string().min(1, "Turno requerido"),
    status: z.enum(["finished", "did_not_attend"]),
})

export const companyHistoryQuerySchema = z.object({
    page: z.union([z.string(), z.number()]).optional(),
    limit: z.union([z.string(), z.number()]).optional(),
    from: z.string().optional(),
    to: z.string().optional(),
    q: z.string().max(100).optional(),
    serviceId: z.string().optional(),
})

export type ConfirmAppointmentDto = z.infer<typeof confirmAppointmentSchema>
export type CheckOrderTimeDto = z.infer<typeof checkOrderTimeSchema>
export type ChangeStatusDto = z.infer<typeof changeStatusSchema>
export type CompanyHistoryQueryDto = z.infer<typeof companyHistoryQuerySchema>
