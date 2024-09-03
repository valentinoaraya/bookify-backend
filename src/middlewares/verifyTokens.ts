import jwt from "jsonwebtoken"
import { Request, Response, NextFunction } from "express"
import { BasicInfoWithID, BasicInfoWithIDRole } from "../types"
import dotenv from "dotenv"

dotenv.config()

export const authenticateTokenUser = (req: Request, res: Response, next: NextFunction): void | Response => {
    const token = req.cookies.acces_token

    if (!token) {
        return res.send({ data: "Usuario no autorizado" }).status(401)
    }

    try {
        const decoded = jwt.verify(token, process.env.SECRET_JWT_KEY as string)
        req.user = decoded as BasicInfoWithIDRole
        next()
    } catch (error: any) {
        return res.send({ data: "Token inválido" }).status(401)
    }
}


export const authenticateTokenCompany = (req: Request, res: Response, next: NextFunction): void | Response => {
    const token = req.cookies.acces_token

    if (!token) {
        return res.send({ data: "Usuario no autorizado" }).status(401)
    }

    try {
        const decoded = jwt.verify(token, process.env.SECRET_JWT_KEY as string)
        req.company = decoded as BasicInfoWithID
        next()
    } catch (error: any) {
        return res.send({ data: "Token inválido" }).status(401)
    }
}