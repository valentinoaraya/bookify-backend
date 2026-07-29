export class AppError extends Error {
    public readonly statusCode: number
    public readonly isOperational: boolean
    public readonly code?: string

    constructor(message: string, statusCode = 500, code?: string) {
        super(message)
        this.name = this.constructor.name
        this.statusCode = statusCode
        this.isOperational = true
        this.code = code
        Error.captureStackTrace(this, this.constructor)
    }
}

export class NotFoundError extends AppError {
    constructor(message = "Recurso no encontrado") {
        super(message, 404)
    }
}

export class ValidationError extends AppError {
    constructor(message = "Datos inválidos") {
        super(message, 400)
    }
}

export class UnauthorizedError extends AppError {
    constructor(message = "No autorizado", code?: string) {
        super(message, 401, code)
    }
}

export class ConflictError extends AppError {
    constructor(message = "Conflicto con el estado actual del recurso") {
        super(message, 409)
    }
}

export class ForbiddenError extends AppError {
    constructor(message = "Acceso denegado") {
        super(message, 403)
    }
}
