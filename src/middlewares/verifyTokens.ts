import jwt from "jsonwebtoken"
import { BasicInfoWithID } from "../types"
import dotenv from "dotenv"

dotenv.config()

export const createToken = (data: BasicInfoWithID): string => {
    const token = jwt.sign(data, process.env.SECRET_JWT_KEY as string, { expiresIn: "1h" })
    return token
}
