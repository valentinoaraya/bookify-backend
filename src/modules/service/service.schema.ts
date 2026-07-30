import { z } from "zod"

const modeEnum = z.enum(["in-person", "online", "in-person-at-home"])

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

export type CreateServiceDto = z.infer<typeof createServiceSchema>
export type UpdateServiceDto = z.infer<typeof updateServiceSchema>
