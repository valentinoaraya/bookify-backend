import nodemailer from "nodemailer"
import { NODEMAILER_HOST, NODEMAILER_PASSWORD, NODEMAILER_PORT, NODEMAILER_USER } from "../config";
import { Email } from "../types";

const transporter = nodemailer.createTransport({
    host: NODEMAILER_HOST,
    port: Number(NODEMAILER_PORT),
    secure: false,
    auth: {
        user: NODEMAILER_USER,
        pass: NODEMAILER_PASSWORD,
    }
});

export const isValidEmail = (email: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export const normalizeEmail = (email: string) => {
    if (!email) return "";

    const validEmail = isValidEmail(email)

    if (!validEmail) return "";

    let normalized = email.trim();
    normalized = normalized.toLowerCase();

    normalized = normalized.replace(/\.+$/, "");

    return normalized;
}

export const sendEmail = async (to: Email | string, subject: string, text: string, html: string) => {
    try {

        if (typeof to === "string") {
            to = normalizeEmail(to);
            if (!to) {
                console.error("❌ Correo inválido proporcionado.");
                return;
            }
        }

        await transporter.sendMail({
            from: '"Bookify" <valentinoaraya04@gmail.com>',
            to,
            subject,
            text,
            html
        });
        console.log(`📧 Correo enviado a ${to}`);
    } catch (error) {
        console.error("❌ Error enviando el correo:", error);
    }
};