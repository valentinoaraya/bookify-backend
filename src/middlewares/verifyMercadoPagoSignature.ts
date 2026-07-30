import crypto from "crypto"
import { NextFunction, Request, Response } from "express"
import { env } from "../config/env"
import { logger } from "../shared/logger"

/**
 * Valida x-signature / x-request-id según docs de Mercado Pago:
 * manifest = `id:{data.id};request-id:{x-request-id};ts:{ts};`
 * HMAC-SHA256(secret, manifest) === v1 del header.
 *
 * `data.id` alfanumérico debe ir en minúsculas al armar el manifest
 * (docs MP). Se prueba también el valor original por si es numérico puro.
 *
 * Acepta firma de cualquiera de las apps configuradas
 * (`MP_WEBHOOK_SECRET` = OAuth/pagos, `MP_WEBHOOK_SECRET_AEDES` = suscripciones).
 * Si ninguna está configurada, se omite la validación.
 */
export function verifyMercadoPagoSignature(
    req: Request,
    res: Response,
    next: NextFunction
): void {
    const secrets = [
        env.MP_WEBHOOK_SECRET,
        env.MP_WEBHOOK_SECRET_AEDES,
    ].filter((s): s is string => Boolean(s))

    if (secrets.length === 0) {
        next()
        return
    }

    const xSignature = headerValue(req.headers["x-signature"])
    const xRequestId = headerValue(req.headers["x-request-id"])
    const dataId = resolveDataId(req)

    if (!xSignature || !xRequestId) {
        res.status(401).send({ error: "Firma de webhook inválida o ausente." })
        return
    }

    const { ts, v1 } = parseSignatureHeader(xSignature)
    if (!ts || !v1) {
        res.status(401).send({ error: "Header x-signature malformado." })
        return
    }

    const dataIdCandidates = uniqueNonEmpty([
        dataId?.toLowerCase(),
        dataId,
    ])

    const matches = dataIdCandidates.length
        ? dataIdCandidates.some((id) =>
              secrets.some((secret) =>
                  signatureMatches(
                      secret,
                      buildManifest(id, xRequestId, ts),
                      v1
                  )
              )
          )
        : secrets.some((secret) =>
              signatureMatches(
                  secret,
                  buildManifest(undefined, xRequestId, ts),
                  v1
              )
          )

    if (!matches) {
        logger.warn(
            {
                xRequestId,
                dataId: dataId ?? null,
                type: req.body?.type,
                action: req.body?.action,
            },
            "Webhook Mercado Pago: firma inválida"
        )
        res.status(401).send({ error: "Firma de webhook inválida." })
        return
    }

    next()
}

function buildManifest(
    dataId: string | undefined,
    requestId: string,
    ts: string
): string {
    const parts: string[] = []
    if (dataId) parts.push(`id:${dataId}`)
    parts.push(`request-id:${requestId}`)
    parts.push(`ts:${ts}`)
    return `${parts.join(";")};`
}

function resolveDataId(req: Request): string | undefined {
    const fromQuery = queryValue(req.query["data.id"] ?? req.query["data_id"])
    if (fromQuery) return fromQuery

    const fromBody = req.body?.data?.id
    if (fromBody !== undefined && fromBody !== null) return String(fromBody)

    return undefined
}

function signatureMatches(
    secret: string,
    manifest: string,
    v1: string
): boolean {
    const computed = crypto
        .createHmac("sha256", secret)
        .update(manifest)
        .digest("hex")

    const expected = Buffer.from(computed, "utf8")
    const received = Buffer.from(v1, "utf8")

    return (
        expected.length === received.length &&
        crypto.timingSafeEqual(expected, received)
    )
}

function headerValue(value: string | string[] | undefined): string | undefined {
    if (Array.isArray(value)) return value[0]
    return value
}

function queryValue(value: unknown): string | undefined {
    if (Array.isArray(value)) return String(value[0] ?? "")
    if (value === undefined || value === null) return undefined
    return String(value)
}

function uniqueNonEmpty(values: Array<string | undefined>): string[] {
    const seen = new Set<string>()
    const result: string[] = []
    for (const value of values) {
        if (!value || seen.has(value)) continue
        seen.add(value)
        result.push(value)
    }
    return result
}

function parseSignatureHeader(header: string): { ts?: string; v1?: string } {
    const result: { ts?: string; v1?: string } = {}
    for (const part of header.split(",")) {
        const [rawKey, ...rest] = part.trim().split("=")
        const key = rawKey?.trim()
        const value = rest.join("=").trim()
        if (key === "ts") result.ts = value
        if (key === "v1") result.v1 = value
    }
    return result
}
