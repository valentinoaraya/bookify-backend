import { Response, Request } from "express"
import { preference } from "../services/mercadopagoService"
import { CLIENT_ID_MP, CLIENT_SECRET_MP, REDIRECT_URL_MP } from "../config"
import CompanyModel from "../models/Company"

export const createPreference = async (req: Request, res: Response): Promise<void | Response> => {
    try {
        const body = {
            items: [
                {
                    id: req.body.serviceId as string,
                    title: req.body.title as string,
                    unit_price: 100,
                    quantity: 1,
                    currency_id: "ARS"
                }
            ],
            back_urls: {
                success: "https://github.com",
                failure: "https://www.youtube.com",
                pending: "https://www.instagram.com"
            },
            auto_return: "approved"
        }

        const response = await preference.create({ body })
        res.send({ data: response.id }).status(200)

    } catch (error: any) {
        res.send({ error: error.message }).status(500)
    }
}

export const getAccessTokenClient = async (req: Request, res: Response): Promise<void | Response> => {

    const { code, state } = req.query

    if (!code || !state) {
        return res.send({ error: 'Falta code o state' }).status(400)
    }

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

        const { access_token, refresh_token, user_id } = data;

        await CompanyModel.findByIdAndUpdate(state, {
            mp_user_id: user_id,
            mp_access_token: access_token,
            mp_refresh_token: refresh_token,
            connectedWithMP: true
        })

        console.log("Access Token obtenido.")
        res.send({ data: "Success" }).status(200)

    } catch (error: any) {
        console.error(error)
        res.send({ error: "Failed to exchange code for token" }).status(500)
    }
}