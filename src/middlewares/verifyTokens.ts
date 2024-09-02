import jwt from "jsonwebtoken"
import { Request, Response, NextFunction } from "express"
import { BasicInfoWithID } from "../types"
import dotenv from "dotenv"

dotenv.config()

const authenticateToken = (req: Request, res: Response, next: NextFunction): void | Response => {
    const token = req.cookies.acces_token

    if (!token) {
        return res.send({ data: "Usuario no autorizado" }).status(401)
    }

    try {
        const decoded = jwt.verify(token, process.env.SECRET_JWT_KEY as string)
        console.log(decoded)
        req.user = decoded as BasicInfoWithID
        next()
    } catch (error: any) {
        return res.send({ data: "Token inválido" }).status(401)
    }
}

export default authenticateToken