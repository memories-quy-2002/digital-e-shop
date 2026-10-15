import { describe, expect, it, vi } from "vitest";
import { PaymentAttemptRepository } from "../payment-attempt.repository";

describe("PaymentAttemptRepository cancellation release", () => {
    it("releases the pending checkout and its reserved promotion redemption in one transaction", async () => {
        const tx = { query: vi.fn().mockResolvedValue({ affectedRows: 1 }) };

        await new PaymentAttemptRepository().releaseCancelledCheckout(tx as never, 17);

        expect(tx.query).toHaveBeenNthCalledWith(1,
            expect.stringContaining("UPDATE pending_checkouts SET status = 'RELEASED'"), [17]);
        expect(tx.query).toHaveBeenNthCalledWith(2,
            "UPDATE discount_redemptions SET status = 'RELEASED' WHERE pending_checkout_id = ? AND status = 'RESERVED'", [17]);
    });

    it("counts committed refunds from a current locking read before enforcing the cap", async () => {
        const tx = { query: vi.fn()
            .mockResolvedValueOnce([{ verified_received_amount_vnd: 1000, order_id: null }])
            .mockResolvedValueOnce([{ id: "refund-1", amount_vnd: 700 }, { id: "refund-2", amount_vnd: "200" }]) };

        await expect(new PaymentAttemptRepository().lockRefundBalance(tx as never, "attempt-1"))
            .resolves.toEqual({ verifiedReceivedAmountVnd: 1000, refundedAmountVnd: 900, orderId: null });
        expect(tx.query.mock.calls[1][0]).toMatch(/SELECT id, amount_vnd FROM payment_attempt_refunds WHERE attempt_id = \? ORDER BY id FOR UPDATE/);
        expect(tx.query.mock.calls[1][1]).toEqual(["attempt-1"]);
    });

    it("uses a current locking read when checking a raced refund idempotency key", async () => {
        const tx = { query: vi.fn().mockResolvedValue([]) };

        await expect(new PaymentAttemptRepository().findRefundByIdempotency(tx as never, "refund-key", true)).resolves.toBeNull();

        expect(tx.query.mock.calls[0][0]).toMatch(/WHERE idempotency_key = \? LIMIT 1 FOR UPDATE/);
        expect(tx.query.mock.calls[0][1]).toEqual(["refund-key"]);
    });

    it("loads refund audit metadata for idempotent replay validation", async () => {
        const tx = { query: vi.fn().mockResolvedValue([{
            id: "refund-1", attempt_id: "attempt-1", amount_vnd: 5000, transfer_reference: "bank-ref-1",
            transferred_at: "2026-10-15", evidence_id: 4, actor_id: "admin-1", reason: "manual transfer",
        }]) };

        await expect(new PaymentAttemptRepository().findRefundByIdempotency(tx as never, "refund-key")).resolves.toEqual({
            operationId: "refund-1", attemptId: "attempt-1", amountVnd: 5000, transferReference: "bank-ref-1",
            transferredAt: "2026-10-15", evidenceId: 4, actorId: "admin-1", reason: "manual transfer",
        });
        expect(tx.query.mock.calls[0][0]).toContain("DATE_FORMAT(transferred_at, '%Y-%m-%d') AS transferred_at");
        expect(tx.query.mock.calls[0][0]).toContain("evidence_id, actor_id, reason");
    });
});
