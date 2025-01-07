import dotenv from "dotenv"

dotenv.config()

export const MONGOOSE_URL = process.env.MONGODB_URL_CONNECTION
export const JWT_KEY = process.env.SECRET_JWT_KEY
export const PORT = 3000