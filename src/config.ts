import dotenv from "dotenv"

dotenv.config()

export const MONGOOSE_URL = process.env.MONGODB_URL_CONNECTION
export const JWT_KEY = process.env.SECRET_JWT_KEY
export const PORT = 3000
export const NODEMAILER_HOST = process.env.NODEMAILER_HOST
export const NODEMAILER_PORT = process.env.NODEMAILER_PORT
export const NODEMAILER_USER = process.env.NODEMAILER_USER
export const NODEMAILER_PASSWORD = process.env.NODEMAILER_PASSWORD