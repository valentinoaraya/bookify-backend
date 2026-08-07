import { describe, it, expect, vi, beforeEach } from "vitest"
import { Types } from "mongoose"
import {
    MpTokenService,
    MP_TOKEN_RENEW_AHEAD_MS,
} from "@/modules/payment/mp-token.service"
import { CompanyRepository } from "@/modules/company/company.repository"
import { MercadoPagoPaymentGateway } from "@/modules/payment/refund.gateway"

describe("MpTokenService", () => {
    const companyId = new Types.ObjectId()

    let companyRepository: Record<string, ReturnType<typeof vi.fn>>
    let paymentGateway: Record<string, ReturnType<typeof vi.fn>>
    let service: MpTokenService

    const baseCompany = () => ({
        _id: companyId,
        name: "Test Co",
        connectedWithMP: true,
        mp_access_token: "access-old",
        mp_refresh_token: "refresh-old",
        token_expires_in: 15552000,
        mp_token_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    })

    beforeEach(() => {
        companyRepository = {
            updateById: vi.fn().mockResolvedValue({ _id: companyId }),
        }
        paymentGateway = {
            refreshOAuthToken: vi.fn(),
        }
        service = new MpTokenService(
            companyRepository as unknown as CompanyRepository,
            paymentGateway as unknown as MercadoPagoPaymentGateway
        )
    })

    describe("needsRefresh", () => {
        it("renueva si no hay mp_token_expires_at (empresas legacy)", () => {
            expect(
                MpTokenService.needsRefresh({
                    mp_access_token: "tok",
                    mp_token_expires_at: null,
                })
            ).toBe(true)
        })

        it("no renueva si el vencimiento está lejos", () => {
            expect(
                MpTokenService.needsRefresh({
                    mp_access_token: "tok",
                    mp_token_expires_at: new Date(
                        Date.now() + 30 * 24 * 60 * 60 * 1000
                    ),
                })
            ).toBe(false)
        })

        it("renueva dentro de la ventana anticipada", () => {
            expect(
                MpTokenService.needsRefresh({
                    mp_access_token: "tok",
                    mp_token_expires_at: new Date(
                        Date.now() + MP_TOKEN_RENEW_AHEAD_MS / 2
                    ),
                })
            ).toBe(true)
        })

        it("no usa updatedAt del perfil: solo mp_token_expires_at", () => {
            const expiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000)
            expect(
                MpTokenService.needsRefresh({
                    mp_access_token: "tok",
                    mp_token_expires_at: expiresAt,
                })
            ).toBe(false)
        })
    })

    describe("buildPersistFields", () => {
        it("guarda fecha absoluta de vencimiento", () => {
            const issuedAt = new Date("2030-01-01T00:00:00.000Z")
            const fields = MpTokenService.buildPersistFields(
                {
                    access_token: "a",
                    refresh_token: "r",
                    expires_in: 3600,
                },
                issuedAt
            )
            expect(fields.mp_token_expires_at.toISOString()).toBe(
                "2030-01-01T01:00:00.000Z"
            )
            expect(fields.mp_access_token).toBe("a")
            expect(fields.connectedWithMP).toBe(true)
        })
    })

    describe("refreshCompanyToken", () => {
        it("persiste tokens nuevos al renovar", async () => {
            paymentGateway.refreshOAuthToken.mockResolvedValue({
                access_token: "access-new",
                refresh_token: "refresh-new",
                expires_in: 7200,
            })

            const token = await service.refreshCompanyToken(baseCompany())

            expect(token).toBe("access-new")
            expect(companyRepository.updateById).toHaveBeenCalledWith(
                companyId,
                expect.objectContaining({
                    $set: expect.objectContaining({
                        mp_access_token: "access-new",
                        mp_refresh_token: "refresh-new",
                        token_expires_in: 7200,
                        connectedWithMP: true,
                    }),
                })
            )
        })

        it("desconecta la empresa si el refresh falla", async () => {
            paymentGateway.refreshOAuthToken.mockResolvedValue(null)

            const token = await service.refreshCompanyToken(baseCompany())

            expect(token).toBeNull()
            expect(companyRepository.updateById).toHaveBeenCalledWith(
                companyId,
                expect.objectContaining({
                    $set: expect.objectContaining({
                        connectedWithMP: false,
                        mp_access_token: "",
                        mp_refresh_token: "",
                        mp_token_expires_at: null,
                    }),
                })
            )
        })
    })

    describe("withValidAccessToken", () => {
        it("reintenta una vez tras 401", async () => {
            paymentGateway.refreshOAuthToken.mockResolvedValue({
                access_token: "access-new",
                refresh_token: "refresh-new",
                expires_in: 7200,
            })

            const execute = vi
                .fn()
                .mockResolvedValueOnce({ unauthorized: true, result: null })
                .mockResolvedValueOnce({
                    unauthorized: false,
                    result: { ok: true },
                })

            const result = await service.withValidAccessToken(
                baseCompany(),
                execute
            )

            expect(result).toEqual({ ok: true })
            expect(execute).toHaveBeenCalledTimes(2)
            expect(execute).toHaveBeenNthCalledWith(2, "access-new")
        })
    })
})
