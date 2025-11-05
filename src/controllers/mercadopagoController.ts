import { Response, Request } from "express"
import { CLIENT_ID_MP, CLIENT_SECRET_MP, REDIRECT_URL_MP } from "../config"
import CompanyModel from "../models/Company"
import ServiceModel from "../models/Service"
import { markAppointmentAsPending, removePendingAppointment } from "../utils/managePendingAppointments"
import { confirmAppointmentWebhook } from "./appointmentController"
import moment from "moment-timezone"
import { PreApproval } from "mercadopago"
import { mercadoPagoAedes } from "../services/mercadopagoService"

export const createPreference = async (req: Request, res: Response): Promise<void | Response> => {
    try {
        if (!req.user) return res.status(401).send({ error: "Usuario no autorizado." })

        const { name, lastName, email, dni, phone } = req.user
        const { empresaId } = req.params
        const { serviceId, title, price, date } = req.body

        const empresa = await CompanyModel.findById(empresaId)

        const service = await ServiceModel.findById(serviceId)

        if (!service) return res.status(404).send({ error: "Servicio no encontrado." })

        if (service.signPrice <= 0) return res.status(400).send({ error: "El servicio no requiere seña. Vuelve al panel principal e intenta volver a sacarlo." })

        if (!empresa || !empresa.mp_access_token) return res.status(404).send({ error: "La empresa no está vinculada con Mercado Pago" })

        const dateObj = moment.tz(date, 'YYYY-MM-DD HH:mm', 'America/Argentina/Buenos_Aires').toDate();
        const userId = `${name}_${lastName}_${email}`;
        const pendingId = await markAppointmentAsPending(serviceId, dateObj, userId);

        if (!pendingId) {
            return res.status(500).send({ error: "No se pudo reservar temporalmente el turno." });
        }

        const body = {
            items: [
                {
                    id: serviceId as string,
                    title: title as string,
                    unit_price: price,
                    quantity: 1,
                    currency_id: "ARS",
                    description: "Seña para un turno.",
                    category_id: serviceId
                }
            ],
            payer: {
                name: name,
                email: email,
                last_name: lastName,
            },
            back_urls: {
                success: "https://bookify-aedes.vercel.app/processingpayment",
                failure: "https://bookify-aedes.vercel.app/processingpayment",
                pending: "https://bookify-aedes.vercel.app/processingpayment"
            },
            auto_return: "approved",
            external_reference: `${empresaId}_${serviceId}_${date}_${name}_${lastName}_${email}_${dni}_${phone}_${pendingId}`,
            statement_descriptor: "BOOKIFY TURNOS"
        }

        const response = await fetch("https://api.mercadopago.com/checkout/preferences", {
            method: "POST",
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${empresa.mp_access_token}`
            },
            body: JSON.stringify(body)
        })

        const data = await response.json()

        if (!data.init_point) {
            await removePendingAppointment(serviceId, pendingId)
            return res.status(500).send({ error: "No se pudo reservar temporalmente el turno. Inténtelo de nuevo más tarde." })
        }

        res.status(200).send({ init_point: data.init_point })

    } catch (error: any) {
        res.status(500).send({ error: error.message })
    }
}

export const getAccessTokenClient = async (req: Request, res: Response): Promise<void | Response> => {

    const { code, state } = req.query

    if (!code || !state) return res.status(400).send({ error: 'Falta code o state' })

    try {

        const response = await fetch('https://api.mercadopago.com/oauth/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                client_secret: CLIENT_SECRET_MP,
                client_id: CLIENT_ID_MP,
                grant_type: 'authorization_code',
                code,
                redirect_uri: REDIRECT_URL_MP
            })
        });

        const data = await response.json()

        const { access_token, refresh_token, user_id, expires_in } = data;

        await CompanyModel.findByIdAndUpdate(state, {
            mp_user_id: user_id,
            mp_access_token: access_token,
            mp_refresh_token: refresh_token,
            token_expires_in: expires_in,
            connectedWithMP: true
        })

        console.log("Access Token obtenido.")
        res.status(200).redirect(`https://bookify.aedestec.com/panel/mercadopago-success`);

    } catch (error: any) {
        console.error(error)
        res.status(500).send({ error: "Failed to exchange code for token." })
    }
}

export const generateOAuthURL = async (req: Request, res: Response): Promise<void | Response> => {
    try {
        const { empresaId } = req.params

        const empresa = await CompanyModel.findById(empresaId)

        if (!empresa) return res.status(404).send({ error: "Empresa no encontrada." })

        if (!CLIENT_ID_MP || !REDIRECT_URL_MP) return res.status(500).send({ error: "No es posible generar la URL: Faltan parámetros." })

        const authURL = `https://auth.mercadopago.com/authorization?client_id=${CLIENT_ID_MP}&response_type=code&platform_id=mp&state=${empresaId}&redirect_uri=${REDIRECT_URL_MP}`

        res.status(200).send({ url: authURL })

    } catch (error: any) {
        console.error(error.message)
        res.status(500).send({ error: "Failed to generate OAuth Code." })
    }
}

export const manageWebhooks = async (req: Request, res: Response): Promise<void | Response> => {
    try {
        const { type, action, user_id, data } = req.body

        if (type === "payment" && action === "payment.created") {
            console.log("Notificación de pago recibida.")
            await confirmAppointmentWebhook(req, res)
        } else if (type === "mp-connect" && action === "application.deauthorized") {
            console.log("Notificación de desautorización recibida.")

            const empresa = await CompanyModel.findOne({ mp_user_id: user_id })

            if (!empresa) return res.status(404).send({ error: "Empresa no encontrada." })

            empresa.mp_access_token = ""
            empresa.mp_refresh_token = ""
            empresa.mp_user_id = ""
            empresa.token_expires_in = 0
            empresa.connectedWithMP = false

            await empresa.save()

            console.log(`Empresa ${empresa.name} desautorizada.`)

            res.status(200).send({ data: "Received" })
        } else if (type === "subscription_preapproval") {
            console.log("Notificación de suscripción recibida.")

            const preapproval = await new PreApproval(mercadoPagoAedes).get({ id: data.id })
            const companyId = preapproval.external_reference

            if (preapproval.status === "authorized") {
                console.log("Suscripción aprobada.")
                await CompanyModel.findByIdAndUpdate(companyId, {
                    $set: { status_suscription: "active" }
                })
            } else {
                console.log("Suscripción no aprobada.")
                await CompanyModel.findByIdAndUpdate(companyId, {
                    $set: { status_suscription: "failed" }
                })
            }

            res.status(200).send({ data: "Received" })
        }
    } catch (error: any) {
        console.error(error.message)
        res.status(500).send({ error: "Failed to manage webhooks." })
    }
}