import jwt from "jsonwebtoken"
import { Request, Response, NextFunction } from "express"
import { BasicInfoWithID } from "../types"
import { JWT_KEY } from "../config"

export const authenticateTokenCompany = (req: Request, res: Response, next: NextFunction): void | Response => {
    const token = req.headers.authorization?.split(" ")[1]

    if (!token) return res.status(401).send({ error: "Usuario no autorizado" })

    try {
        const decoded = jwt.verify(token, JWT_KEY as string)
        req.company = decoded as BasicInfoWithID
        next()
    } catch (error: any) {
        return res.status(401).send({ error: "Token inválido" })
    }
}