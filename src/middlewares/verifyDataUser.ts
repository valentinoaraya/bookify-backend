import { Request, Response, NextFunction } from "express";
import { verifyUserInputs } from "../utils/verifyData";

export const verifyDataUser = (req: Request, res: Response, next: NextFunction): void | Response => {
    const { dataUser } = req.body
    const verifiedData = verifyUserInputs(dataUser)
    if (!verifiedData) return res.status(400).send({ error: "Datos incompletos del ususario" })
    req.user = verifiedData
    next()
}