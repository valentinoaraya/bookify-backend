import crypto from "crypto"
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { Request, Response, NextFunction } from "express"

describe("verifyMercadoPagoSignature", () => {
    const paymentsSecret = "test-webhook-secret-payments"
    const aedesSecret = "test-webhook-secret-aedes"
    let verifyMercadoPagoSignature: typeof import("@/middlewares/verifyMercadoPagoSignature").verifyMercadoPagoSignature

    async function loadMiddleware(env: {
        MP_WEBHOOK_SECRET?: string
        MP_WEBHOOK_SECRET_AEDES?: string
    }) {
        vi.resetModules()
        // Vacío explícito: si solo borramos, dotenv vuelve a cargar el .env real.
        process.env.MP_WEBHOOK_SECRET = env.MP_WEBHOOK_SECRET ?? ""
        process.env.MP_WEBHOOK_SECRET_AEDES = env.MP_WEBHOOK_SECRET_AEDES ?? ""
        ;({ verifyMercadoPagoSignature } = await import(
            "@/middlewares/verifyMercadoPagoSignature"
        ))
    }

    beforeEach(async () => {
        await loadMiddleware({
            MP_WEBHOOK_SECRET: paymentsSecret,
            MP_WEBHOOK_SECRET_AEDES: aedesSecret,
        })
    })

    afterEach(() => {
        delete process.env.MP_WEBHOOK_SECRET
        delete process.env.MP_WEBHOOK_SECRET_AEDES
        vi.resetModules()
    })

    function mockRes() {
        const res = {
            status: vi.fn().mockReturnThis(),
            send: vi.fn().mockReturnThis(),
        }
        return res as unknown as Response & {
            status: ReturnType<typeof vi.fn>
            send: ReturnType<typeof vi.fn>
        }
    }

    function signedRequest(secret: string) {
        const dataId = "123456"
        const requestId = "abc-req"
        const ts = String(Date.now())
        const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`
        const v1 = crypto.createHmac("sha256", secret).update(manifest).digest("hex")

        return {
            req: {
                headers: {
                    "x-signature": `ts=${ts},v1=${v1}`,
                    "x-request-id": requestId,
                },
                query: { "data.id": dataId },
            } as unknown as Request,
            next: vi.fn() as NextFunction,
        }
    }

    it("rechaza firma inválida con 401", () => {
        const req = {
            headers: {
                "x-signature": "ts=123,v1=deadbeef",
                "x-request-id": "req-1",
            },
            query: { "data.id": "pay-1" },
        } as unknown as Request
        const res = mockRes()
        const next = vi.fn() as NextFunction

        verifyMercadoPagoSignature(req, res, next)

        expect(res.status).toHaveBeenCalledWith(401)
        expect(next).not.toHaveBeenCalled()
    })

    it("acepta firma de la app de pagos (MP_WEBHOOK_SECRET)", () => {
        const { req, next } = signedRequest(paymentsSecret)
        const res = mockRes()

        verifyMercadoPagoSignature(req, res, next)

        expect(next).toHaveBeenCalled()
        expect(res.status).not.toHaveBeenCalled()
    })

    it("acepta firma de la app Aedes (MP_WEBHOOK_SECRET_AEDES)", () => {
        const { req, next } = signedRequest(aedesSecret)
        const res = mockRes()

        verifyMercadoPagoSignature(req, res, next)

        expect(next).toHaveBeenCalled()
        expect(res.status).not.toHaveBeenCalled()
    })

    it("rechaza headers ausentes con 401", () => {
        const req = { headers: {}, query: {} } as unknown as Request
        const res = mockRes()
        const next = vi.fn() as NextFunction

        verifyMercadoPagoSignature(req, res, next)

        expect(res.status).toHaveBeenCalledWith(401)
        expect(next).not.toHaveBeenCalled()
    })

    it("acepta data.id alfanumérico en mayúsculas usando minúsculas en el manifest", () => {
        const dataId = "ABC123DEF"
        const requestId = "req-case"
        const ts = String(Date.now())
        const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`
        const v1 = crypto
            .createHmac("sha256", paymentsSecret)
            .update(manifest)
            .digest("hex")

        const req = {
            headers: {
                "x-signature": `ts=${ts},v1=${v1}`,
                "x-request-id": requestId,
            },
            query: { "data.id": dataId },
        } as unknown as Request
        const res = mockRes()
        const next = vi.fn() as NextFunction

        verifyMercadoPagoSignature(req, res, next)

        expect(next).toHaveBeenCalled()
        expect(res.status).not.toHaveBeenCalled()
    })

    it("usa data.id del body si no viene en la query", () => {
        const dataId = "987654"
        const requestId = "req-body"
        const ts = String(Date.now())
        const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`
        const v1 = crypto
            .createHmac("sha256", paymentsSecret)
            .update(manifest)
            .digest("hex")

        const req = {
            headers: {
                "x-signature": `ts=${ts},v1=${v1}`,
                "x-request-id": requestId,
            },
            query: {},
            body: { type: "payment", data: { id: dataId } },
        } as unknown as Request
        const res = mockRes()
        const next = vi.fn() as NextFunction

        verifyMercadoPagoSignature(req, res, next)

        expect(next).toHaveBeenCalled()
        expect(res.status).not.toHaveBeenCalled()
    })

    it("omite validación si no hay secrets configurados", async () => {
        await loadMiddleware({})
        const req = { headers: {}, query: {} } as unknown as Request
        const res = mockRes()
        const next = vi.fn() as NextFunction

        verifyMercadoPagoSignature(req, res, next)

        expect(next).toHaveBeenCalled()
        expect(res.status).not.toHaveBeenCalled()
    })
})
