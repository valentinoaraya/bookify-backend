import { Router } from "express";
import { authenticateTokenCompany } from "../middlewares/verifyTokens";
import { createPreference, generateOAuthURL, getAccessTokenClient, manageWebhooks } from "../controllers/mercadopagoController";
import { verifyDataUser } from "../middlewares/verifyDataUser";

const mercadopagoRouter = Router()

mercadopagoRouter.post("/create-preference/:empresaId", verifyDataUser, createPreference)
mercadopagoRouter.get("/oauth/callback", getAccessTokenClient)
mercadopagoRouter.get("/oauth/generate-url/:empresaId", authenticateTokenCompany, generateOAuthURL)
mercadopagoRouter.post("/webhooks", manageWebhooks)

export default mercadopagoRouter