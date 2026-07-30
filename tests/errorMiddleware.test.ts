import { describe, it, expect, vi } from "vitest"
import { Request, Response } from "express"
import { errorMiddleware } from "@/shared/errors/errorMiddleware"

describe("errorMiddleware", () => {
    const makeRes = () => {
        const res = {
            status: vi.fn().mockReturnThis(),
            send: vi.fn().mockReturnThis(),
        }
        return res as unknown as Response & {
            status: ReturnType<typeof vi.fn>
            send: ReturnType<typeof vi.fn>
        }
    }

    it("mapea E11000 de email a 409", () => {
        const res = makeRes()
        const err = Object.assign(new Error("E11000 duplicate key"), {
            code: 11000,
            keyPattern: { email: 1 },
        })

        errorMiddleware(err, {} as Request, res, vi.fn())

        expect(res.status).toHaveBeenCalledWith(409)
        expect(res.send).toHaveBeenCalledWith({
            error: "Ya existe una empresa con este email.",
        })
    })

    it("mapea E11000 de company_id a 409", () => {
        const res = makeRes()
        const err = Object.assign(new Error("E11000 duplicate key"), {
            code: 11000,
            keyPattern: { company_id: 1 },
        })

        errorMiddleware(err, {} as Request, res, vi.fn())

        expect(res.status).toHaveBeenCalledWith(409)
        expect(res.send).toHaveBeenCalledWith({
            error: "No se pudo generar un identificador único. Intentá de nuevo.",
        })
    })
})
