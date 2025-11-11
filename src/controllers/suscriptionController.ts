import ServiceModel from "../models/Service";
import CompanyModel from "../models/Company";
import { PLAN_RULES } from "../utils/planRules";
import { PreApproval } from "mercadopago";
import { mercadoPagoAedes } from "../services/mercadopagoService";
import { Request, Response } from "express";
import { namesAndAmounts } from "../utils/planRules";
import { BACK_URL_AEDES } from "../config";

const applyPlanRestrictions = async (companyId: string, newPlan: string) => {
    const company = await CompanyModel.findById(companyId);

    if (!company) throw new Error("Empresa no encontrada.")

    const rules = PLAN_RULES[newPlan];

    const services = await ServiceModel.find({ companyId });
    if (services.length > rules.max_services) {
        const toDelete = services.slice(rules.max_services);
        await ServiceModel.updateMany({ _id: { $in: toDelete.map((s) => s._id) } }, { active: false });
    }
};

const applyPlanBeneffits = async (companyId: string, newPlan: string) => {
    const company = await CompanyModel.findById(companyId);

    if (!company) throw new Error("Empresa no encontrada.")

    const rules = PLAN_RULES[newPlan];

    const services = await ServiceModel.find({ companyId }).sort({ createdAt: 1 }); // opcional: mantener orden

    const activeServices = services.filter(s => s.active);
    const inactiveServices = services.filter(s => !s.active);

    const remainingSlots = rules.max_services - activeServices.length;

    if (remainingSlots > 0 && inactiveServices.length > 0) {
        const toActivate = inactiveServices.slice(0, remainingSlots);
        await ServiceModel.updateMany(
            { _id: { $in: toActivate.map(s => s._id) } },
            { $set: { active: true } }
        );
    }
};

export const upgradeSuscription = async (req: Request, res: Response): Promise<void | Response> => {
    try {
        const { suscriptionId } = req.params
        const { newPlan, payer_email, companyId } = req.body

        await CompanyModel.findByIdAndUpdate(companyId, {
            $set: {
                "suscription.status_suscription": "upgrading"
            }
        })

        const response = await new PreApproval(mercadoPagoAedes).update({
            id: suscriptionId as any,
            body: {
                status: "cancelled",
            }
        })

        if (response.status !== "cancelled") throw new Error("Error al cancelar suscripción actual.")

        const suscription = await new PreApproval(mercadoPagoAedes).create({
            body: {
                back_url: BACK_URL_AEDES,
                reason: `Suscripción Bookify - ${namesAndAmounts[newPlan as keyof typeof namesAndAmounts].name}`,
                auto_recurring: {
                    frequency: 1,
                    frequency_type: "months",
                    transaction_amount: namesAndAmounts[newPlan as keyof typeof namesAndAmounts].price,
                    currency_id: "ARS"
                },
                payer_email: payer_email,
                status: "pending",
                external_reference: `${companyId}`
            }
        })

        await CompanyModel.findByIdAndUpdate(companyId, {
            $set: {
                "suscription.suscription_id": suscription.id,
                "suscription.plan": newPlan,
            }
        })

        await applyPlanBeneffits(companyId, newPlan)

        res.status(200).send({
            data: {
                init_point: suscription.init_point,
            }
        })
    } catch (error: any) {
        res.status(500).send({ error: error.message })
    }
}

export const downgradeSuscription = async (req: Request, res: Response): Promise<void | Response> => {
    try {
        const { suscriptionId } = req.params
        const { newPlan, companyId } = req.body

        const response = await new PreApproval(mercadoPagoAedes).update({
            id: suscriptionId as any,
            body: {
                reason: `Suscripción Bookify - ${namesAndAmounts[newPlan as keyof typeof namesAndAmounts].name}`,
                auto_recurring: {
                    transaction_amount: namesAndAmounts[newPlan as keyof typeof namesAndAmounts].price,
                    currency_id: "ARS"
                }
            }
        })

        if (response.auto_recurring?.transaction_amount !== namesAndAmounts[newPlan as keyof typeof namesAndAmounts].price) throw new Error("No hemos podido cambiar el monto del plan")

        await CompanyModel.findByIdAndUpdate(companyId, {
            $set: {
                "suscription.plan": newPlan,
                "suscription.status_suscription": "downgrading"
            }
        })

        await applyPlanRestrictions(companyId, newPlan)

        res.status(200).send({ data: "Plan changed succesfully" })

    } catch (error: any) {
        res.status(500).send({ error: error.message })
    }
}

export const cancelSuscription = async (req: Request, res: Response): Promise<void | Response> => {
    try {
        const { suscriptionId } = req.params
        const { companyId } = req.body

        const response = await new PreApproval(mercadoPagoAedes).update({
            id: suscriptionId as any,
            body: {
                status: "cancelled",
            }
        })

        if (response.status !== "cancelled") throw new Error("Error al cancelar suscripción actual.")

        await CompanyModel.findByIdAndUpdate(companyId, {
            $set: {
                "suscription.status_suscription": "inactive"
            }
        })

        res.status(200).send({
            data: "Suscription cancelled"
        })
    } catch (error: any) {
        res.status(500).send({ error: error.message })
    }
}