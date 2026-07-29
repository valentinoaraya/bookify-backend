import express, { Express } from "express"
import cors from "cors"
import helmet from "helmet"
import { env } from "./config/env"
import { errorMiddleware } from "./shared/errors"
import { composition } from "./composition"
import { globalLimiter } from "./middlewares/rateLimiters"

export const createApp = (): Express => {
    const app = express()

    // La app corre detrás del proxy del hosting: sin esto todas las requests
    // comparten la IP del proxy y el rate limit se aplicaría a todos juntos.
    app.set("trust proxy", 1)

    app.use(helmet())
    app.use(
        cors({
            origin: env.FRONTEND_URL,
            credentials: true,
        })
    )
    app.use(express.json({ limit: "100kb" }))

    app.get("/health", (_req, res) => {
        res.status(200).send({ status: "ok" })
    })

    app.use(globalLimiter)

    app.use("/appointments", composition.appointmentRoutes)
    app.use("/companies", composition.companyRoutes)
    app.use("/services", composition.serviceRoutes)
    app.use("/mercadopago", composition.paymentRoutes)
    app.use("/suscriptions", composition.subscriptionRoutes)

    app.use(errorMiddleware)

    return app
}
