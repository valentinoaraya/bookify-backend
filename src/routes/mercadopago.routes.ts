import { Router } from "express";
import { authenticateTokenUser } from "../middlewares/verifyTokens";
import { createPreference, generateOAuthURL, getAccessTokenClient } from "../controllers/mercadopagoController";

const mercadopagoRouter = Router()

mercadopagoRouter.post("/create-preference/:empresaId", authenticateTokenUser, createPreference)
mercadopagoRouter.get("/oauth/callback", getAccessTokenClient)
mercadopagoRouter.get("/oauth/generate-url/:empresaId", generateOAuthURL)

export default mercadopagoRouter