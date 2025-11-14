import { Router } from "express";
import { cancelSuscription, downgradeSuscription, upgradeSuscription } from "../controllers/suscriptionController";
import { authenticateTokenCompany } from "../middlewares/verifyTokens";

export const suscriptionsRoutes = Router()

suscriptionsRoutes.post("/upgrade/:suscriptionId", authenticateTokenCompany, upgradeSuscription)
suscriptionsRoutes.post("/downgrade/:suscriptionId", authenticateTokenCompany, downgradeSuscription)
suscriptionsRoutes.delete("/cancel/:suscriptionId", authenticateTokenCompany, cancelSuscription)