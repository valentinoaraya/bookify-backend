import { Request, Response, NextFunction } from "express"
import { UnauthorizedError } from "../../shared/errors"
import { AuthService } from "./auth.service"
import { BasicInfoWithID } from "../../types"

/**
 * Factory de middlewares de autenticación.
 * Se inyecta AuthService desde composition.ts.
 */
export const createAuthMiddlewares = (authService: AuthService) => {
    const authenticateTokenCompany = (
        req: Request,
        _res: Response,
        next: NextFunction
    ): void => {
        const token = req.headers.authorization?.split(" ")[1]

        if (!token) {
            return next(new UnauthorizedError("Usuario no autorizado"))
        }

        try {
            const decoded = authService.verifyAccessToken(token)
            req.company = decoded as unknown as BasicInfoWithID
            next()
        } catch (error) {
            next(error)
        }
    }

    const authenticateRefreshTokenCompany = async (
        req: Request,
        _res: Response,
        next: NextFunction
    ): Promise<void> => {
        const refreshToken = req.body.refresh_token || req.headers["x-refresh-token"]

        if (!refreshToken) {
            return next(new UnauthorizedError("Refresh token requerido"))
        }

        try {
            const decoded = await authService.verifyRefreshToken(refreshToken)
            req.company = decoded as unknown as BasicInfoWithID
            next()
        } catch (error) {
            next(error)
        }
    }

    return {
        authenticateTokenCompany,
        authenticateRefreshTokenCompany,
    }
}

export type AuthMiddlewares = ReturnType<typeof createAuthMiddlewares>
