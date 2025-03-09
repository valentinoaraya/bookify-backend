import dotenv from "dotenv"

dotenv.config()

export const FRONTEND_URL = process.env.FRONTEND_URL
export const MONGOOSE_URL = process.env.MONGODB_URL_CONNECTION
export const JWT_KEY = process.env.SECRET_JWT_KEY
export const PORT = 3000
export const NODEMAILER_HOST = process.env.NODEMAILER_HOST
export const NODEMAILER_PORT = process.env.NODEMAILER_PORT
export const NODEMAILER_USER = process.env.NODEMAILER_USER
export const NODEMAILER_PASSWORD = process.env.NODEMAILER_PASSWORD
export const ACCESS_TOKEN_MP = process.env.ACCESS_TOKEN_MP
export const CLIENT_ID_MP = process.env.CLIENT_ID_MP
export const CLIENT_SECRET_MP = process.env.CLIENT_SECRET_MP
export const REDIRECT_URL_MP = process.env.REDIRECT_URL_MP