import jwt from "jsonwebtoken"
import { Request, Response, NextFunction } from "express"
import { BasicInfoWithID } from "../types"
import { JWT_KEY } from "../config"
import CompanyModel from "../models/Company"

export const authenticateTokenCompany = (req: Request, res: Response, next: NextFunction): void | Response => {
    const token = req.headers.authorization?.split(" ")[1]

    if (!token) return res.status(401).send({ error: "Usuario no autorizado" })

    try {
        const decoded = jwt.verify(token, JWT_KEY as string)
        req.company = decoded as BasicInfoWithID
        next()
    } catch (error: any) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).send({
                error: "Token expirado",
                code: "TOKEN_EXPIRED",
                message: "El access token ha expirado. Usa el refresh token para obtener uno nuevo."
            })
        }
        return res.status(401).send({ error: "Token inválido" })
    }
}

export const authenticateRefreshTokenCompany = async (req: Request, res: Response, next: NextFunction): Promise<void | Response> => {
    const refreshToken = req.body.refresh_token || req.headers['x-refresh-token']

    if (!refreshToken) {
        return res.status(401).send({ error: "Refresh token requerido" })
    }

    try {
        const decoded = jwt.verify(refreshToken, JWT_KEY as string) as BasicInfoWithID

        const company = await CompanyModel.findById(decoded.id)

        if (!company || company.refresh_token !== refreshToken) {
            return res.status(401).send({ error: "Refresh token inválido o revocado" })
        }

        req.company = decoded
        next()
    } catch (error: any) {
        return res.status(401).send({ error: "Refresh token inválido o expirado" })
    }
}