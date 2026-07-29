import { describe, it, expect, vi, beforeEach } from "vitest"
import { Types } from "mongoose"
import { AuthService } from "@/modules/auth/auth.service"
import { CompanyRepository } from "@/modules/company/company.repository"
import { ValidationError, UnauthorizedError } from "@/shared/errors"
import { CompanyDocument } from "@/modules/company/company.types"
import bcrypt from "bcrypt"

vi.mock("bcrypt", () => ({
    default: {
        compare: vi.fn(),
        hash: vi.fn(),
    },
}))

describe("AuthService", () => {
    const companyId = new Types.ObjectId()
    let repository: {
        findByEmail: ReturnType<typeof vi.fn>
        findById: ReturnType<typeof vi.fn>
        updateRefreshToken: ReturnType<typeof vi.fn>
    }
    let authService: AuthService

    beforeEach(() => {
        repository = {
            findByEmail: vi.fn(),
            findById: vi.fn(),
            updateRefreshToken: vi.fn(),
        }
        authService = new AuthService(repository as unknown as CompanyRepository)
        vi.clearAllMocks()
    })

    describe("login", () => {
        it("loguea correctamente y guarda refresh token", async () => {
            repository.findByEmail.mockResolvedValue({
                _id: companyId,
                name: "Test Co",
                email: "test@test.com",
                password: "hashed",
            } as CompanyDocument)
            vi.mocked(bcrypt.compare).mockResolvedValue(true as never)
            repository.updateRefreshToken.mockResolvedValue({})

            const result = await authService.login({
                email: "test@test.com",
                password: "secret1",
            })

            expect(result.name).toBe("Test Co")
            expect(result.access_token).toBeTruthy()
            expect(result.refresh_token).toBeTruthy()
            expect(repository.updateRefreshToken).toHaveBeenCalledWith(
                companyId,
                result.refresh_token
            )
        })

        it("falla si la empresa no existe", async () => {
            repository.findByEmail.mockResolvedValue(null)

            await expect(
                authService.login({ email: "x@test.com", password: "secret1" })
            ).rejects.toBeInstanceOf(ValidationError)
        })

        it("falla si la contraseña es incorrecta", async () => {
            repository.findByEmail.mockResolvedValue({
                _id: companyId,
                name: "Test Co",
                email: "test@test.com",
                password: "hashed",
            } as CompanyDocument)
            vi.mocked(bcrypt.compare).mockResolvedValue(false as never)

            await expect(
                authService.login({ email: "test@test.com", password: "wrong12" })
            ).rejects.toThrow("Contraseña incorrecta.")
        })
    })

    describe("logout", () => {
        it("invalida el refresh token", async () => {
            repository.updateRefreshToken.mockResolvedValue({})
            await authService.logout(companyId)
            expect(repository.updateRefreshToken).toHaveBeenCalledWith(companyId, "")
        })
    })

    describe("verifyAccessToken", () => {
        it("verifica un token válido", () => {
            const tokens = authService.createTokens({
                id: companyId,
                name: "Test",
                email: "test@test.com" as `${string}@${string}`,
            })
            const decoded = authService.verifyAccessToken(tokens.access_token)
            expect(decoded.name).toBe("Test")
        })

        it("rechaza un token inválido", () => {
            expect(() => authService.verifyAccessToken("invalid.token")).toThrow(
                UnauthorizedError
            )
        })
    })

    describe("refresh", () => {
        it("emite nuevos tokens y actualiza DB", async () => {
            repository.updateRefreshToken.mockResolvedValue({})
            const tokens = await authService.refresh(
                companyId,
                "Test",
                "test@test.com" as `${string}@${string}`
            )
            expect(tokens.access_token).toBeTruthy()
            expect(repository.updateRefreshToken).toHaveBeenCalled()
        })
    })
})
