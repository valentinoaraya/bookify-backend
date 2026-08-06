import { z } from "zod"

const modeEnum = z.enum(["in-person", "online", "in-person-at-home"])

const timeHmRegex = /^([01]\d|2[0-3]):[0-5]\d$/

const normalizeHm = (value: string) => value.slice(0, 5)

const workScheduleBlockSchema = z.object({
    start: z
        .string()
        .transform(normalizeHm)
        .pipe(z.string().regex(timeHmRegex, "Hora de inicio inválida (HH:mm).")),
    end: z
        .string()
        .transform(normalizeHm)
        .pipe(z.string().regex(timeHmRegex, "Hora de fin inválida (HH:mm).")),
})


const workScheduleSchema = z
    .object({
        days: z
            .array(z.number().int().min(0).max(6))
            .min(1, "Seleccioná al menos un día."),
        blocks: z
            .array(workScheduleBlockSchema)
            .min(1, "Agregá al menos un bloque horario."),
        turnIntervalMinutes: z
            .number()
            .int()
            .min(1, "El intervalo debe ser al menos 1 minuto."),
        graceMinutes: z.number().int().min(0, "La gracia no puede ser negativa."),
    })
    .superRefine((schedule, ctx) => {
        const uniqueDays = new Set(schedule.days)
        if (uniqueDays.size !== schedule.days.length) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Hay días duplicados en la plantilla.",
                path: ["days"],
            })
        }

        const sorted = [...schedule.blocks].sort((a, b) =>
            a.start.localeCompare(b.start)
        )
        for (let i = 0; i < sorted.length; i++) {
            const block = sorted[i]
            if (block.start >= block.end) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: `El bloque ${block.start}-${block.end} es inválido: inicio debe ser menor que fin.`,
                    path: ["blocks"],
                })
            }
            if (i > 0) {
                const prev = sorted[i - 1]
                if (block.start < prev.end) {
                    ctx.addIssue({
                        code: z.ZodIssueCode.custom,
                        message: `Los bloques ${prev.start}-${prev.end} y ${block.start}-${block.end} se solapan.`,
                        path: ["blocks"],
                    })
                }
            }
        }
    })

export const createServiceSchema = z.object({
    title: z.string().min(1, "Titulo incorrecto o incompleto."),
    description: z.string().min(1, "Descripción incorrecto o incompleto."),
    price: z.number({ error: "Precio incorrecto o incompleto." }),
    capacityPerShift: z.number({ error: "Capacidad de personas incorrecto o incompleto." }),
    duration: z.number({ error: "Duración incorrecto o incompleto." }),
    signPrice: z.number({ error: "Precio de seña incorrecto o incompleto." }),
    mode: modeEnum.optional().default("online"),
})

export const updateServiceSchema = z
    .object({
        title: z.string().min(1).optional(),
        description: z.string().optional(),
        price: z.number().optional(),
        capacityPerShift: z.number().positive().optional(),
        duration: z.number().optional(),
        signPrice: z.number().optional(),
        mode: modeEnum.optional(),
    })
    .passthrough()

export const enableSlotsSchema = z.object({
    hourStart: z.string().min(1),
    hourFinish: z.string().min(1),
    turnEach: z.string().min(1),
    days: z.array(z.string()).min(1),
})

export const slotDateSchema = z.object({
    date: z.string().min(1),
    all: z.boolean().optional(),
})

export const clearAvailableByDaySchema = z.object({
    date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (YYYY-MM-DD)."),
})

export const clearAvailableByDatetimesSchema = z.object({
    datetimes: z
        .array(
            z
                .string()
                .regex(
                    /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/,
                    "Datetime inválido (YYYY-MM-DD HH:mm)."
                )
        )
        .min(1, "Seleccioná al menos un horario.")
        .max(200, "Podés eliminar hasta 200 horarios por vez."),
})

export const updateWorkScheduleSchema = z
    .object({
        workSchedule: workScheduleSchema,
        autoGenerateSlots: z.boolean(),
    })
    .superRefine((data, ctx) => {
        if (data.autoGenerateSlots) {
            if (data.workSchedule.days.length === 0) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: "Para generar turnos automáticamente necesitás al menos un día.",
                    path: ["workSchedule", "days"],
                })
            }
            if (data.workSchedule.blocks.length === 0) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: "Para generar turnos automáticamente necesitás al menos un bloque.",
                    path: ["workSchedule", "blocks"],
                })
            }
        }
    })

export type CreateServiceDto = z.infer<typeof createServiceSchema>
export type UpdateServiceDto = z.infer<typeof updateServiceSchema>
export type UpdateWorkScheduleDto = z.infer<typeof updateWorkScheduleSchema>
