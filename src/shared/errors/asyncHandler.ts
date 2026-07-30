import { Request, Response, NextFunction, RequestHandler } from "express"

type AsyncRequestHandler = (
    req: Request,
    res: Response,
    next: NextFunction
) => Promise<void | Response>

/**
 * Envuelve handlers async para que los errores lleguen al errorMiddleware
 * sin necesidad de try/catch en cada controller.
 */
export const asyncHandler = (fn: AsyncRequestHandler): RequestHandler => {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next)
    }
}
