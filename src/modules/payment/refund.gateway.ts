import { generateRandomId } from "../../utils/generateRandomId"
import { logger } from "../../shared/logger"
import { env } from "../../config/env"

export interface RefundPort {
    refund(
        paymentId: string,
        accessToken: string,
        amount?: number
    ): Promise<unknown | null>
}

export class MercadoPagoPaymentGateway implements RefundPort {
    async refund(
        paymentId: string,
        accessToken: string,
        amount?: number
    ): Promise<unknown | null> {
        const result = await this.refundDetailed(paymentId, accessToken, amount)
        if (result.unauthorized || !result.ok) return null
        return result.data
    }

    async refundDetailed(
        paymentId: string,
        accessToken: string,
        amount?: number
    ): Promise<
        | { ok: true; data: unknown; unauthorized: false }
        | { ok: false; data?: unknown; unauthorized: boolean; status: number }
    > {
        try {
            const randomId = generateRandomId()
            const response = await fetch(
                `https://api.mercadopago.com/v1/payments/${paymentId}/refunds`,
                {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                        "X-Idempotency-Key": randomId,
                        "Content-Type": "application/json",
                    },
                    body: amount ? JSON.stringify({ amount }) : null,
                }
            )

            const data = await response.json()
            if (!response.ok) {
                logger.error(
                    { data, status: response.status },
                    "Error al procesar el reembolso"
                )
                return {
                    ok: false,
                    data,
                    unauthorized: response.status === 401,
                    status: response.status,
                }
            }

            logger.info("Devolución completa.")
            return { ok: true, data, unauthorized: false }
        } catch (error) {
            logger.error({ err: error }, "Error en refund")
            return { ok: false, unauthorized: false, status: 0 }
        }
    }

    async getPayment(
        paymentId: string,
        accessToken: string
    ): Promise<any | null> {
        const result = await this.getPaymentDetailed(paymentId, accessToken)
        if (result.unauthorized || !result.ok) return null
        return result.data
    }

    async getPaymentDetailed(
        paymentId: string,
        accessToken: string
    ): Promise<
        | { ok: true; data: any; unauthorized: false }
        | { ok: false; data?: unknown; unauthorized: boolean; status: number }
    > {
        const response = await fetch(
            `https://api.mercadopago.com/v1/payments/${paymentId}`,
            {
                method: "GET",
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "Content-Type": "application/json",
                },
            }
        )
        if (!response.ok) {
            return {
                ok: false,
                unauthorized: response.status === 401,
                status: response.status,
            }
        }
        return {
            ok: true,
            data: await response.json(),
            unauthorized: false,
        }
    }

    async createPreference(
        accessToken: string,
        body: Record<string, unknown>
    ): Promise<{
        init_point?: string
        unauthorized?: boolean
        status: number
    }> {
        const response = await fetch(
            "https://api.mercadopago.com/checkout/preferences",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${accessToken}`,
                },
                body: JSON.stringify(body),
            }
        )
        const data = await response.json().catch(() => ({}))
        return {
            ...data,
            status: response.status,
            unauthorized: response.status === 401,
        }
    }

    async exchangeOAuthCode(code: string): Promise<{
        access_token: string
        refresh_token: string
        user_id: string | number
        expires_in: number
    } | null> {
        const response = await fetch("https://api.mercadopago.com/oauth/token", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                client_secret: env.CLIENT_SECRET_MP,
                client_id: env.CLIENT_ID_MP,
                grant_type: "authorization_code",
                code,
                redirect_uri: env.REDIRECT_URL_MP,
            }),
        })
        const data = await response.json()
        if (!response.ok || !data?.access_token) {
            logger.error(
                { status: response.status, data },
                "Error al intercambiar código OAuth de Mercado Pago"
            )
            return null
        }
        return {
            access_token: data.access_token,
            refresh_token: data.refresh_token ?? "",
            user_id: data.user_id,
            expires_in: data.expires_in ?? 0,
        }
    }

    async refreshOAuthToken(refreshToken: string): Promise<{
        access_token: string
        refresh_token?: string
        expires_in: number
    } | null> {
        const response = await fetch("https://api.mercadopago.com/oauth/token", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                client_secret: env.CLIENT_SECRET_MP,
                client_id: env.CLIENT_ID_MP,
                grant_type: "refresh_token",
                refresh_token: refreshToken,
            }),
        })
        const data = await response.json()
        if (!response.ok || !data?.access_token) {
            logger.error(
                { status: response.status, data },
                "Error al renovar token OAuth de Mercado Pago"
            )
            return null
        }
        return {
            access_token: data.access_token,
            refresh_token: data.refresh_token,
            expires_in: data.expires_in ?? 0,
        }
    }

    buildOAuthUrl(empresaId: string): string {
        const redirectUri = encodeURIComponent(env.REDIRECT_URL_MP)
        return `https://auth.mercadopago.com/authorization?client_id=${env.CLIENT_ID_MP}&response_type=code&platform_id=mp&state=${empresaId}&redirect_uri=${redirectUri}`
    }
}
