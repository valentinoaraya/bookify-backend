import jwt from "jsonwebtoken"
import { Request, Response, NextFunction } from "express"
import { BasicInfoWithID, BasicInfoWithIDRole } from "../types"
import { JWT_KEY } from "../config"

export const authenticateTokenUser = (req: Request, res: Response, next: NextFunction): void | Response => {
    const token = req.headers.authorization?.split(" ")[1]

    if (!token) return res.send({ error: "Usuario no autorizado" }).status(401)

    try {
        const decoded = jwt.verify(token, JWT_KEY as string)
        req.user = decoded as BasicInfoWithIDRole
        next()
    } catch (error: any) {
        return res.send({ error: "Token inválido" }).status(401)
    }
}


export const authenticateTokenCompany = (req: Request, res: Response, next: NextFunction): void | Response => {
    const token = req.headers.authorization?.split(" ")[1]

    if (!token) return res.send({ error: "Usuario no autorizado" }).status(401)

    try {
        const decoded = jwt.verify(token, JWT_KEY as string)
        req.company = decoded as BasicInfoWithID
        next()
    } catch (error: any) {
        return res.send({ error: "Token inválido" }).status(401)
    }
}