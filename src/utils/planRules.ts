interface PlanRule {
	max_services: number;
	max_professionals: number;
	email_notifications: boolean;
	refunds: boolean;
	integrations: boolean;
}

export const PLAN_RULES: Record<string, PlanRule> = {
	individual: {
		max_services: 3,
		max_professionals: 1,
		email_notifications: true,
		refunds: false,
		integrations: false,
	},
	individual_plus: {
		max_services: Infinity,
		max_professionals: 1,
		email_notifications: true,
		refunds: true,
		integrations: true,
	},
	team: {
		max_services: Infinity,
		max_professionals: 5,
		email_notifications: true,
		refunds: true,
		integrations: true,
	},
};

export const namesAndAmounts = {
	individual: {
		name: "Plan Individual",
		price: 0,
	},
	individual_plus: {
		name: "Plan Individual Plus",
		price: 9900,
	},
	team: {
		name: "Plan Equipo",
		price: 19900,
	},
};

/** Marcador interno: upgrade desde plan free (sin PreApproval previo). */
export const FREE_UPGRADE_MARKER = "__free__";

export const FREE_PLAN = "individual" as const;

export function isPaidPlan(plan: string): boolean {
	return (namesAndAmounts[plan as keyof typeof namesAndAmounts]?.price ?? 0) > 0;
}

export function planAllowsIntegrations(plan: string): boolean {
	return PLAN_RULES[plan]?.integrations === true;
}
