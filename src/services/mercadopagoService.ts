import { MercadoPagoConfig, Preference } from "mercadopago";
import { ACCESS_TOKEN_MP } from "../config";

const client = new MercadoPagoConfig({
    accessToken: ACCESS_TOKEN_MP as string
})
export const preference = new Preference(client)