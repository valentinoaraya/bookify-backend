import { Response, Request } from "express"
import { CLIENT_ID_MP, CLIENT_SECRET_MP, REDIRECT_URL_MP } from "../config"
import CompanyModel from "../models/Company"

export const createPreference = async (req: Request, res: Response): Promise<void | Response> => {
    try {

        if (!req.user) return res.send({ error: "Usuario no autorizado." })

        // 1. Obtengo los datos necesarios
        const { name, email } = req.user
        const { empresaId } = req.params
        const { serviceId, title, price, date } = req.body

        const empresa = await CompanyModel.findById(empresaId)

        if (!empresa || !empresa.mp_access_token) return res.send({ error: "La empresa no está vinculada con Mercado Pago" }).status(404)

        // 2. Creo el body de la preferencia
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
                name: name.split(' ')[0],
                email: email,
                last_name: name.split(' ')[1],
            },
            back_urls: {
                success: "https://bookify-aedes.vercel.app/user-panel",
                failure: "https://bookify-aedes.vercel.app/user-panel",
                pending: "https://bookify-aedes.vercel.app/user-panel"
            },
            auto_return: "approved",
            external_reference: `${req.user.id}_${empresaId}_${serviceId}_${date}`,
            statement_descriptor: "BOOKIFY TURNOS"
        }

        // 3. Creo la preferencia con el access_token de la empresa
        const response = await fetch("https://api.mercadopago.com/checkout/preferences", {
            method: "POST",
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${empresa.mp_access_token}`
            },
            body: JSON.stringify(body)
        })

        // 4. Leo respuesta de Mercado Pago
        const data = await response.json()

        res.send({ init_point: data.init_point }).status(200)

    } catch (error: any) {
        res.send({ error: error.message }).status(500)
    }
}

export const getAccessTokenClient = async (req: Request, res: Response): Promise<void | Response> => {

    const { code, state } = req.query

    if (!code || !state) return res.send({ error: 'Falta code o state' }).status(400)

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
        res.send({ error: "Failed to exchange code for token." }).status(500)
    }
}

export const generateOAuthURL = async (req: Request, res: Response): Promise<void | Response> => {
    try {
        const { empresaId } = req.params

        const empresa = await CompanyModel.findById(empresaId)

        if (!empresa) return res.send({ error: "Empresa no encontrada." }).status(404)

        if (!CLIENT_ID_MP || !REDIRECT_URL_MP) return res.send({ error: "No es posible generar la URL: Faltan parámetros." })

        const authURL = `https://auth.mercadopago.com/authorization?client_id=${CLIENT_ID_MP}&response_type=code&platform_id=mp&state=${empresaId}&redirect_uri=${REDIRECT_URL_MP}`

        res.send({ url: authURL }).status(200)

    } catch (error: any) {
        console.error(error.message)
        res.send({ error: "Failed to generate OAuth Code." }).status(500)
    }
}