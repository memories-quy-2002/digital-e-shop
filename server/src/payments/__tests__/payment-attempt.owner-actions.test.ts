import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../database/transaction", () => ({ withTransaction: vi.fn((work) => work({ query: vi.fn() })) }));

import { PaymentReconciliationService } from "../payment-reconciliation.service";
import { withTransaction } from "../../database/transaction";

describe("owner payment attempt actions", () => {
    beforeEach(() => vi.clearAllMocks());

    it("coalesces reconciliation within the persisted 15-second owner lock window", async () => {
        const tx = { query: vi.fn() };
        vi.mocked(withTransaction).mockImplementation(async (work) => work(tx as never));
        const paymentAttempts = { claimOwnedReconciliationRequest: vi.fn().mockResolvedValue({ coalesced: true, retryAfterSeconds: 8 }) };
        const tasks = { enqueue: vi.fn() };
        const service = new PaymentReconciliationService({} as never, {} as never, undefined, paymentAttempts as never, tasks as never);

        await expect(service.requestOwnedReconciliation("attempt-1", { kind: "authenticated", userId: "owner-1" }))
            .resolves.toEqual({ accepted: true, retryAfterSeconds: 8 });
        expect(paymentAttempts.claimOwnedReconciliationRequest).toHaveBeenCalledWith({ attemptId: "attempt-1", owner: { kind: "authenticated", userId: "owner-1" } }, expect.any(Date), tx);
        expect(tasks.enqueue).not.toHaveBeenCalled();
    });

    it("persists cancellation intent and enqueues cancellation in one transaction", async () => {
        const tx = { query: vi.fn() };
        vi.mocked(withTransaction).mockImplementation(async (work) => work(tx as never));
        const paymentAttempts = {
            requestOwnedCancellation: vi.fn().mockResolvedValue({ attemptId: "attempt-1", pendingCheckoutId: 7, expiresAt: new Date(Date.now() + 60_000).toISOString(), orderState: "NOT_CREATED", cancelRequestedAt: null }),
        };
        const tasks = { enqueuePayOSCancellation: vi.fn().mockResolvedValue({ taskId: 11, dueAt: new Date(Date.now() + 15_000) }) };
        const service = new PaymentReconciliationService({} as never, {} as never, undefined, paymentAttempts as never, tasks as never);

        await expect(service.requestOwnedCancellation("attempt-1", { kind: "guest", guestCartId: "guest-1" }))
            .resolves.toEqual({ accepted: true, orderId: null, retryAfterSeconds: 15 });
        expect(paymentAttempts.requestOwnedCancellation).toHaveBeenCalledWith({ attemptId: "attempt-1", owner: { kind: "guest", guestCartId: "guest-1" } }, tx);
        expect(tasks.enqueuePayOSCancellation).toHaveBeenCalledWith(tx, "attempt-1", expect.objectContaining({ operation: "CANCEL", pendingCheckoutId: 7 }), expect.any(Date));
    });
});
