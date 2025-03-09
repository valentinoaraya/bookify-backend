import { Router } from "express";
import { authenticateTokenUser } from "../middlewares/verifyTokens";
import { createPreference, getAccessTokenClient } from "../controllers/mercadopagoController";

const mercadopagoRouter = Router()

mercadopagoRouter.post("/create-preference", authenticateTokenUser, createPreference)
mercadopagoRouter.get("/oauth/callback", getAccessTokenClient)

export default mercadopagoRouter