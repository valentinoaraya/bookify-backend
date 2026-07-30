import { Request, Response, NextFunction, RequestHandler } from "express"
import { ZodSchema } from "zod"
import { ValidationError } from "../errors"

type RequestTarget = "body" | "query" | "params"

/**
 * Middleware de validación con Zod.
 * Reemplaza el target (body/query/params) con el resultado parseado.
 */
export const validate = (
    schema: ZodSchema,
    target: RequestTarget = "body"
): RequestHandler => {
    return (req: Request, _res: Response, next: NextFunction) => {
        const result = schema.safeParse(req[target])
        if (!result.success) {
            const firstIssue = result.error.issues[0]
            const path = firstIssue?.path?.length
                ? firstIssue.path.join(".")
                : "datos"
            const message = firstIssue
                ? `${path}: ${firstIssue.message}`
                : "Datos inválidos"
            return next(new ValidationError(message))
        }
        req[target] = result.data
        next()
    }
}
