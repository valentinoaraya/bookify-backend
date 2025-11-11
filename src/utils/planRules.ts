interface PlanRule {
    max_services: number,
    max_professionals: number,
    email_notifications: boolean,
    refunds: boolean,
    integrations: boolean,
}

export const PLAN_RULES: Record<string, PlanRule> = {
    individual: {
        max_services: 5,
        max_professionals: 1,
        email_notifications: true,
        refunds: true,
        integrations: true,
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
        price: 12000
    },
    individual_plus: {
        name: "Plan Individual Plus",
        price: 18000
    },
    team: {
        name: "Plan Equipo",
        price: 35000
    },
}