/**
 * Re-export de compatibilidad.
 * Preferir importar desde `./config/env` en código nuevo.
 */
export {
    env,
    FRONTEND_URL,
    MONGOOSE_URL,
    JWT_KEY,
    PORT,
    NODEMAILER_HOST,
    NODEMAILER_PORT,
    NODEMAILER_USER,
    NODEMAILER_PASSWORD,
    ACCESS_TOKEN_MP,
    CLIENT_ID_MP,
    CLIENT_SECRET_MP,
    REDIRECT_URL_MP,
    NOTIFICATION_URL_MP,
    ADMIN_API_KEY,
    REDIS_HOST,
    REDIS_PORT,
    ACCESS_TOKEN_MP_AEDES,
    BACK_URL_AEDES,
} from "./config/env"
