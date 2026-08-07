/**
 * Se ejecuta al cargar el archivo (antes de importar el código bajo test).
 * Debe setear env ANTES de que `config/env.ts` valide con Zod.
 */
process.env.NODE_ENV = "test"
process.env.MONGODB_URL_CONNECTION =
    process.env.MONGODB_URL_CONNECTION || "mongodb://127.0.0.1:27017/bookify-test"
process.env.SECRET_JWT_KEY = process.env.SECRET_JWT_KEY || "test-jwt-secret-key-for-vitest"
process.env.FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173"
process.env.NODEMAILER_HOST = process.env.NODEMAILER_HOST || "localhost"
process.env.NODEMAILER_PORT = process.env.NODEMAILER_PORT || "587"
process.env.NODEMAILER_USER = process.env.NODEMAILER_USER || "test@test.com"
process.env.NODEMAILER_PASSWORD = process.env.NODEMAILER_PASSWORD || "test"
process.env.EMAIL_FROM = process.env.EMAIL_FROM || "Bookify <test@test.com>"
process.env.DEV_EMAIL_REDIRECT = process.env.DEV_EMAIL_REDIRECT || ""
process.env.ACCESS_TOKEN_MP = process.env.ACCESS_TOKEN_MP || "TEST_MP_TOKEN"
process.env.ACCESS_TOKEN_MP_AEDES = process.env.ACCESS_TOKEN_MP_AEDES || "TEST_MP_AEDES"
process.env.CLIENT_ID_MP = process.env.CLIENT_ID_MP || "TEST_CLIENT_ID"
process.env.CLIENT_SECRET_MP = process.env.CLIENT_SECRET_MP || "TEST_CLIENT_SECRET"
process.env.REDIRECT_URL_MP =
    process.env.REDIRECT_URL_MP || "http://localhost:5000/mercadopago/oauth/callback"
process.env.NOTIFICATION_URL_MP =
    process.env.NOTIFICATION_URL_MP || "http://localhost:5000/mercadopago/webhooks"
process.env.BACK_URL_AEDES = process.env.BACK_URL_AEDES || "http://localhost:5173"
process.env.REDIS_HOST = process.env.REDIS_HOST || "localhost"
process.env.REDIS_PORT = process.env.REDIS_PORT || "6379"
process.env.PORT = process.env.PORT || "5000"
process.env.AEDESFLOW_WEBHOOK_URL =
    process.env.AEDESFLOW_WEBHOOK_URL ||
    "https://sauaavezfviumloirvrh.supabase.co/functions/v1/saas-webhook"
process.env.SAAS_WEBHOOK_SECRET = process.env.SAAS_WEBHOOK_SECRET || ""
