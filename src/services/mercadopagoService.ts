import { MercadoPagoConfig, Preference } from "mercadopago";
import { ACCESS_TOKEN_MP, ACCESS_TOKEN_MP_AEDES } from "../config";

const client = new MercadoPagoConfig({
    accessToken: ACCESS_TOKEN_MP as string
})
export const preference = new Preference(client)

export const mercadoPagoAedes = new MercadoPagoConfig({
    accessToken: ACCESS_TOKEN_MP_AEDES as string
}) 