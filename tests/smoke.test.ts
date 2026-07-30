import { describe, it, expect } from "vitest"
import request from "supertest"
import { createApp } from "@/app"

describe("App smoke test", () => {
    it("responde 200 en /health", async () => {
        const app = createApp()
        const response = await request(app).get("/health")
        expect(response.status).toBe(200)
        expect(response.body).toEqual({ status: "ok" })
    })
})
