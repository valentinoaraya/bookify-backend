import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z
	.object({
		NODE_ENV: z
			.enum(["development", "production", "test"])
			.default("development"),
		PORT: z.coerce.number().default(5000),
		FRONTEND_URL: z.url().default("http://localhost:5173"),
		MONGODB_URL_CONNECTION: z
			.string()
			.min(1, "MONGODB_URL_CONNECTION es requerida"),
		SECRET_JWT_KEY: z.string().min(1, "SECRET_JWT_KEY es requerida"),
		NODEMAILER_HOST: z.string().min(1),
		NODEMAILER_PORT: z.coerce.number().default(587),
		NODEMAILER_USER: z.string().min(1),
		NODEMAILER_PASSWORD: z.string().min(1),
		EMAIL_FROM: z
			.string()
			.default("Bookify <valentinoaraya04@gmail.com>"),
		DEV_EMAIL_REDIRECT: z.string().default(""),
		ACCESS_TOKEN_MP: z.string().min(1),
		ACCESS_TOKEN_MP_AEDES: z.string().min(1),
		CLIENT_ID_MP: z.string().min(1),
		CLIENT_SECRET_MP: z.string().min(1),
		REDIRECT_URL_MP: z.string().url(),
		/** URL pública del endpoint de webhooks de pagos (preferencias de seña). */
		NOTIFICATION_URL_MP: z.string().url(),
		BACK_URL_AEDES: z.string().url(),
		ADMIN_API_KEY: z.string().optional().default(""),
		/** Secret de webhooks de la app OAuth / pagos de turnos. */
		MP_WEBHOOK_SECRET: z.string().optional().default(""),
		/** Secret de webhooks de la app Aedes / suscripciones Bookify. */
		MP_WEBHOOK_SECRET_AEDES: z.string().optional().default(""),
		/**
		 * Webhook de AedesFlow (gestión interna). Sin secret, el cliente no-op.
		 * URL por defecto del instruccional connect-aedesflow.md.
		 */
		AEDESFLOW_WEBHOOK_URL: z
			.string()
			.default(
				"https://sauaavezfviumloirvrh.supabase.co/functions/v1/saas-webhook",
			),
		SAAS_WEBHOOK_SECRET: z.string().optional().default(""),
		/**
		 * Pesos por 1 USD para convertir precios ARS → amount_usd / mrr_usd.
		 * Si no se setea, amount_usd queda en 0 (permitido por el contrato).
		 */
		AEDESFLOW_USD_ARS_RATE: z.preprocess(
			(value) =>
				value === "" || value === undefined || value === null
					? undefined
					: value,
			z.coerce.number().positive().optional(),
		),
		REDIS_HOST: z.string().default("localhost"),
		REDIS_PORT: z.coerce.number().default(6379),
	})
	.superRefine((data, ctx) => {
		if (data.NODE_ENV === "development") {
			if (!data.DEV_EMAIL_REDIRECT) {
				ctx.addIssue({
					code: "custom",
					path: ["DEV_EMAIL_REDIRECT"],
					message:
						"DEV_EMAIL_REDIRECT es requerida en development (todos los emails se redirigen ahí)",
				});
			} else if (!z.string().email().safeParse(data.DEV_EMAIL_REDIRECT).success) {
				ctx.addIssue({
					code: "custom",
					path: ["DEV_EMAIL_REDIRECT"],
					message: "DEV_EMAIL_REDIRECT debe ser un email válido",
				});
			}
		}
	});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
	console.error("❌ Variables de entorno inválidas:");
	console.error(parsed.error.flatten().fieldErrors);
	throw new Error(
		"Configuración de entorno inválida. Revisá el archivo .env",
	);
}

export const env = parsed.data;

/** @deprecated Preferir `env`. Aliases de compatibilidad durante la migración. */
export const FRONTEND_URL = env.FRONTEND_URL;
export const MONGOOSE_URL = env.MONGODB_URL_CONNECTION;
export const JWT_KEY = env.SECRET_JWT_KEY;
export const PORT = env.PORT;
export const NODEMAILER_HOST = env.NODEMAILER_HOST;
export const NODEMAILER_PORT = String(env.NODEMAILER_PORT);
export const NODEMAILER_USER = env.NODEMAILER_USER;
export const NODEMAILER_PASSWORD = env.NODEMAILER_PASSWORD;
export const ACCESS_TOKEN_MP = env.ACCESS_TOKEN_MP;
export const CLIENT_ID_MP = env.CLIENT_ID_MP;
export const CLIENT_SECRET_MP = env.CLIENT_SECRET_MP;
export const REDIRECT_URL_MP = env.REDIRECT_URL_MP;
export const NOTIFICATION_URL_MP = env.NOTIFICATION_URL_MP;
export const ADMIN_API_KEY = env.ADMIN_API_KEY;
export const REDIS_HOST = env.REDIS_HOST;
export const REDIS_PORT = String(env.REDIS_PORT);
export const ACCESS_TOKEN_MP_AEDES = env.ACCESS_TOKEN_MP_AEDES;
export const BACK_URL_AEDES = env.BACK_URL_AEDES;
