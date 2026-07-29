export type RefundActor = "client" | "company" | "system_unavailable"

/**
 * Calcula el monto a reembolsar según el actor que cancela / libera el turno.
 * - client → 50%
 * - company / system_unavailable → 100%
 */
export function calculateRefundAmount(
    totalPaid: number,
    actor: RefundActor
): number {
    if (!Number.isFinite(totalPaid) || totalPaid <= 0) return 0
    if (actor === "client") return totalPaid * 0.5
    return totalPaid
}

export function refundStatusForAmount(
    totalPaid: number,
    refundedAmount: number
): "partially_refunded" | "refunded" {
    if (refundedAmount >= totalPaid) return "refunded"
    return "partially_refunded"
}
