import { z } from "zod"

const registerPlanEnum = z.enum(["individual", "individual_plus"], {
    message: "Plan no disponible",
})

export const registerCompanySchema = z
    .object({
        name: z.string().min(1, "Nombre requerido"),
        email: z.string().email("Email incorrecto o incompleto."),
        password: z
            .string()
            .min(6, "La contraseña debe contener al menos 6 caracteres"),
        phone: z.string().min(1, "Teléfono requerido"),
        plan: registerPlanEnum,
        payer_email: z.string().optional(),
        province: z.string().min(1, "Provincia requerida"),
        city: z.string().min(1, "Ciudad requerida"),
        street: z.string().min(1, "Calle requerida"),
        number: z.string().min(1, "Número de calle requerido"),
    })
    .superRefine((data, ctx) => {
        if (data.plan !== "individual") {
            const email = data.payer_email?.trim()
            if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: "Falta el correo del pagador",
                    path: ["payer_email"],
                })
            }
        }
    })

export const loginCompanySchema = z.object({
    email: z.string().email("Email incorrecto o incompleto."),
    password: z.string().min(6, "La contraseña debe contener al menos 6 caracteres"),
})

export const updateCompanySchema = z
    .object({
        name: z.string().min(1).optional(),
        phone: z.string().min(1).optional(),
        email: z.string().email().optional(),
        province: z.string().optional(),
        city: z.string().optional(),
        street: z.string().optional(),
        number: z.union([z.string(), z.number()]).optional(),
        company_id: z.string().min(1).optional(),
        reminders: z
            .array(
                z.object({
                    hoursBefore: z.number(),
                    services: z.array(z.any()),
                })
            )
            .optional(),
        cancellationAnticipationHours: z.number().optional(),
        bookingAnticipationHours: z.number().optional(),
        slotsVisibilityDays: z.number().optional(),
    })
    .passthrough()

export const createLocationSchema = z.object({
    name: z.string().min(1, "Nombre de la sede requerido"),
    province: z.string().optional(),
    city: z.string().min(1, "Ciudad requerida"),
    street: z.string().min(1, "Calle requerida"),
    number: z.union([z.string(), z.number()]).transform(String).pipe(
        z.string().min(1, "Número de calle requerido")
    ),
    isDefault: z.boolean().optional(),
})

export const updateLocationSchema = z
    .object({
        name: z.string().min(1).optional(),
        province: z.string().optional(),
        city: z.string().min(1).optional(),
        street: z.string().min(1).optional(),
        number: z
            .union([z.string(), z.number()])
            .transform(String)
            .optional(),
    })
    .refine(
        (data) =>
            data.name !== undefined ||
            data.province !== undefined ||
            data.city !== undefined ||
            data.street !== undefined ||
            data.number !== undefined,
        { message: "No hay campos para actualizar" }
    )

export type RegisterCompanyDto = z.infer<typeof registerCompanySchema>
export type LoginCompanyDto = z.infer<typeof loginCompanySchema>
export type UpdateCompanyDto = z.infer<typeof updateCompanySchema>
export type CreateLocationDto = z.infer<typeof createLocationSchema>
export type UpdateLocationDto = z.infer<typeof updateLocationSchema>
