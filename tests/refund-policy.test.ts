import { describe, it, expect } from "vitest"
import {
    calculateRefundAmount,
    refundStatusForAmount,
} from "@/modules/payment/refund-policy"

describe("refund-policy", () => {
    it.each([
        ["client", 1000, 500],
        ["company", 1000, 1000],
        ["system_unavailable", 1000, 1000],
        ["client", 0, 0],
        ["company", -10, 0],
    ] as const)(
        "calculateRefundAmount(%s, %i) → %i",
        (actor, total, expected) => {
            expect(calculateRefundAmount(total, actor)).toBe(expected)
        }
    )

    it("refundStatusForAmount distingue parcial vs total", () => {
        expect(refundStatusForAmount(1000, 500)).toBe("partially_refunded")
        expect(refundStatusForAmount(1000, 1000)).toBe("refunded")
        expect(refundStatusForAmount(1000, 1001)).toBe("refunded")
    })
})
