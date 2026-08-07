import { Types } from "mongoose"
import { logger } from "../../shared/logger"
import { CompanyRepository } from "../company/company.repository"
import { CompanyAttrs, CompanyDocument } from "../company/company.types"
import { MercadoPagoPaymentGateway } from "./refund.gateway"

/** Renovar 7 días antes del vencimiento real del access token. */
export const MP_TOKEN_RENEW_AHEAD_MS = 7 * 24 * 60 * 60 * 1000

export type MpOAuthTokenPayload = {
    access_token: string
    refresh_token?: string
    expires_in: number
}

type CompanyMpFields = Pick<
    CompanyAttrs,
    | "name"
    | "connectedWithMP"
    | "mp_access_token"
    | "mp_refresh_token"
    | "token_expires_in"
    | "mp_token_expires_at"
> & { _id: Types.ObjectId }

/**
 * Gestión de tokens OAuth de Mercado Pago por empresa:
 * persistencia con fecha absoluta de vencimiento, refresh proactivo y limpieza
 * si el refresh falla (p. ej. refresh_token inválido).
 */
export class MpTokenService {
    constructor(
        private readonly companyRepository: CompanyRepository,
        private readonly paymentGateway: MercadoPagoPaymentGateway
    ) {}

    static computeExpiresAt(
        expiresInSeconds: number,
        from: Date = new Date()
    ): Date {
        const seconds = Math.max(0, expiresInSeconds || 0)
        return new Date(from.getTime() + seconds * 1000)
    }

    /** Campos a guardar tras OAuth connect o refresh exitoso. */
    static buildPersistFields(tokens: MpOAuthTokenPayload, issuedAt = new Date()) {
        const expiresIn = tokens.expires_in || 0
        return {
            mp_access_token: tokens.access_token,
            ...(tokens.refresh_token
                ? { mp_refresh_token: tokens.refresh_token }
                : {}),
            token_expires_in: expiresIn,
            mp_token_expires_at: this.computeExpiresAt(expiresIn, issuedAt),
            connectedWithMP: true as const,
            updatedAt: issuedAt,
        }
    }

    static buildClearFields(at = new Date()) {
        return {
            mp_access_token: "",
            mp_refresh_token: "",
            mp_user_id: "",
            token_expires_in: 0,
            mp_token_expires_at: null as null,
            connectedWithMP: false as const,
            updatedAt: at,
        }
    }

    static needsRefresh(
        company: Pick<
            CompanyAttrs,
            "mp_access_token" | "mp_token_expires_at"
        >,
        now = Date.now(),
        renewAheadMs = MP_TOKEN_RENEW_AHEAD_MS
    ): boolean {
        if (!company.mp_access_token) return true
        if (!company.mp_token_expires_at) return true
        const expiresAtMs = new Date(company.mp_token_expires_at).getTime()
        if (Number.isNaN(expiresAtMs)) return true
        return now >= expiresAtMs - renewAheadMs
    }

    async persistTokens(
        companyId: string | Types.ObjectId,
        tokens: MpOAuthTokenPayload,
        extra: Record<string, unknown> = {}
    ): Promise<CompanyDocument | null> {
        return this.companyRepository.updateById(companyId, {
            $set: {
                ...MpTokenService.buildPersistFields(tokens),
                ...extra,
            },
        })
    }

    async clearConnection(
        companyId: string | Types.ObjectId
    ): Promise<CompanyDocument | null> {
        return this.companyRepository.updateById(companyId, {
            $set: MpTokenService.buildClearFields(),
        })
    }

    /**
     * Renueva el access token vía refresh_token.
     * Si MP rechaza el refresh, desconecta la empresa para forzar re-vinculación.
     */
    async refreshCompanyToken(
        company: CompanyMpFields
    ): Promise<string | null> {
        if (!company.mp_refresh_token) {
            logger.warn(
                { companyId: company._id },
                "Sin refresh_token de Mercado Pago; no se puede renovar"
            )
            return null
        }

        const data = await this.paymentGateway.refreshOAuthToken(
            company.mp_refresh_token
        )

        if (!data?.access_token) {
            logger.error(
                { companyId: company._id, companyName: company.name },
                "Falló el refresh de token MP; se desvincula la cuenta"
            )
            await this.clearConnection(company._id)
            return null
        }

        await this.persistTokens(company._id, {
            access_token: data.access_token,
            refresh_token: data.refresh_token || company.mp_refresh_token,
            expires_in: data.expires_in,
        })

        logger.info(
            { companyId: company._id, companyName: company.name },
            "Token de Mercado Pago renovado"
        )
        return data.access_token
    }

    /**
     * Devuelve un access token usable. Renueva si falta expires_at, ya venció
     * o está dentro de la ventana de renovación anticipada.
     */
    async getValidAccessToken(
        company: CompanyMpFields
    ): Promise<string | null> {
        if (!company.connectedWithMP && !company.mp_access_token) {
            return null
        }

        if (!MpTokenService.needsRefresh(company)) {
            return company.mp_access_token || null
        }

        if (!company.mp_refresh_token) {
            return company.mp_access_token || null
        }

        return this.refreshCompanyToken(company)
    }

    /**
     * Ejecuta una llamada a MP con token válido; si responde 401, renueva una
     * vez y reintenta.
     */
    async withValidAccessToken<T>(
        company: CompanyMpFields,
        execute: (
            accessToken: string
        ) => Promise<{ unauthorized: boolean; result: T }>
    ): Promise<T | null> {
        let token = await this.getValidAccessToken(company)
        if (!token) return null

        const first = await execute(token)
        if (!first.unauthorized) return first.result

        logger.warn(
            { companyId: company._id },
            "MP respondió 401; reintentando tras refresh"
        )

        const refreshed = await this.refreshCompanyToken({
            ...company,
            mp_access_token: token,
        })
        if (!refreshed) return null

        const second = await execute(refreshed)
        if (second.unauthorized) {
            logger.error(
                { companyId: company._id },
                "MP sigue en 401 tras refresh; se desvincula"
            )
            await this.clearConnection(company._id)
            return null
        }
        return second.result
    }
}
