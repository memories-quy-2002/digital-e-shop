import { describe, expect, it, vi } from "vitest";
import { AdminPaymentAttemptsRepository } from "../admin-payment-attempts.repository";

describe("AdminPaymentAttemptsRepository", () => {
    it("uses a current locking read for committed refund rows after locking the attempt", async () => {
        const query = vi.fn()
            .mockResolvedValueOnce([{
                id: "attempt-1", provider: "payos", payment_state: "PAID", resolution_state: "OPEN", order_id: null,
                expected_amount_vnd: 1000, verified_received_amount_vnd: 1000,
            }])
            .mockResolvedValueOnce([{ id: "refund-1", amount_vnd: 700 }, { id: "refund-2", amount_vnd: "200" }]);
        const repository = new AdminPaymentAttemptsRepository();

        await expect(repository.lockRefundSummary({ query } as never, "attempt-1")).resolves.toMatchObject({
            provider: "payos", receivedAmountVnd: 1000, refundedAmountVnd: 900,
        });
        expect(query.mock.calls[0][0]).toContain("LIMIT 1 FOR UPDATE");
        expect(query.mock.calls[1][0]).toMatch(/SELECT id, amount_vnd FROM payment_attempt_refunds WHERE attempt_id = \? ORDER BY id FOR UPDATE/);
        expect(query.mock.calls[1][1]).toEqual(["attempt-1"]);
    });
});
