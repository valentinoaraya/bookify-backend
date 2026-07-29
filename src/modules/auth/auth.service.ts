import bcrypt from "bcrypt"
import jwt from "jsonwebtoken"
import { Types } from "mongoose"
import { env } from "../../config/env"
import { Email } from "../../types"
import {
    UnauthorizedError,
    ValidationError,
} from "../../shared/errors"
import { CompanyRepository } from "../company/company.repository"
import {
    AuthCompanyPayload,
    AuthTokens,
    LoginCompanyInput,
} from "../company/company.types"
import { normalizeEmail } from "../../services/emailService"

export class AuthService {
    constructor(private readonly companyRepository: CompanyRepository) {}

    createTokens(data: AuthCompanyPayload): AuthTokens {
        const payload = {
            id: data.id,
            name: data.name,
            email: data.email,
        }
        const access_token = jwt.sign(payload, env.SECRET_JWT_KEY, { expiresIn: "1h" })
        const refresh_token = jwt.sign(payload, env.SECRET_JWT_KEY, { expiresIn: "7d" })
        return { access_token, refresh_token }
    }

    async hashPassword(password: string): Promise<string> {
        return bcrypt.hash(password, 10)
    }

    async login(input: LoginCompanyInput): Promise<AuthCompanyPayload & AuthTokens> {
        const email = this.parseEmail(input.email)
        this.assertPasswordFormat(input.password)

        const company = await this.companyRepository.findByEmail(email)
        if (!company) {
            throw new ValidationError("Empresa no existente.")
        }

        const isValid = await bcrypt.compare(input.password, company.password)
        if (!isValid) {
            throw new ValidationError("Contraseña incorrecta.")
        }

        const payload: AuthCompanyPayload = {
            id: company._id,
            name: company.name,
            email: company.email as Email,
        }

        const tokens = this.createTokens(payload)
        await this.companyRepository.updateRefreshToken(company._id, tokens.refresh_token)

        return { ...payload, ...tokens }
    }

    async refresh(
        companyId: Types.ObjectId | string,
        name: string,
        email: Email
    ): Promise<AuthTokens> {
        const tokens = this.createTokens({
            id: companyId as Types.ObjectId,
            name,
            email,
        })
        await this.companyRepository.updateRefreshToken(companyId, tokens.refresh_token)
        return tokens
    }

    async logout(companyId: Types.ObjectId | string): Promise<void> {
        await this.companyRepository.updateRefreshToken(companyId, "")
    }

    verifyAccessToken(token: string): AuthCompanyPayload {
        try {
            const decoded = jwt.verify(token, env.SECRET_JWT_KEY) as AuthCompanyPayload
            if (!decoded?.id) {
                throw new UnauthorizedError("Token inválido")
            }
            return decoded
        } catch (error: any) {
            if (error instanceof UnauthorizedError) throw error
            if (error.name === "TokenExpiredError") {
                throw new UnauthorizedError(
                    "El access token ha expirado. Usa el refresh token para obtener uno nuevo.",
                    "TOKEN_EXPIRED"
                )
            }
            throw new UnauthorizedError("Token inválido")
        }
    }

    async verifyRefreshToken(refreshToken: string): Promise<AuthCompanyPayload> {
        try {
            const decoded = jwt.verify(refreshToken, env.SECRET_JWT_KEY) as AuthCompanyPayload
            const company = await this.companyRepository.findById(decoded.id)

            if (!company || company.refresh_token !== refreshToken) {
                throw new UnauthorizedError("Refresh token inválido o revocado")
            }

            return decoded
        } catch (error) {
            if (error instanceof UnauthorizedError) throw error
            throw new UnauthorizedError("Refresh token inválido o expirado")
        }
    }

    parseEmail(email: string): string {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        if (!emailRegex.test(email.trim())) {
            throw new ValidationError("Email incorrecto o incompleto.")
        }
        return normalizeEmail(email.trim()) || email.trim().toLowerCase()
    }

    assertPasswordFormat(password: string): void {
        if (typeof password !== "string") {
            throw new ValidationError("La contraseña debe ser un string.")
        }
        if (password.length < 6) {
            throw new ValidationError("La contraseña debe contener al menos 6 caracteres")
        }
    }
}
