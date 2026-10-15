import { describe, expect, it, vi } from "vitest";
import { PayOSReconciliationTaskProcessor } from "../payos-reconciliation-task.processor";

describe("PayOS reconciliation task processor", () => {
    it("continues cancellation verification in verify-only mode through the recovery window", async () => {
        const reconciliation = {
            cancelPendingCheckoutForTask: vi.fn().mockResolvedValue({ outcome: "PENDING", verifyOnly: true }),
            reconcilePendingCheckoutForTask: vi.fn(),
        };
        const processor = new PayOSReconciliationTaskProcessor(reconciliation as never);
        const requestedAt = new Date(Date.now() - 11 * 60_000).toISOString();
        const lease = {
            payload: {
                attemptId: "attempt-1", pendingCheckoutId: 7, generation: 4,
                expiresAt: new Date(Date.now() + 12 * 60 * 60_000).toISOString(),
                operation: "CANCEL", cancelRequestedAt: requestedAt, flowId: "flow-1",
            },
        } as never;

        const result = await processor.process(lease);
        expect(reconciliation.cancelPendingCheckoutForTask).toHaveBeenCalledWith({
            pendingCheckoutId: 7, attemptId: "attempt-1", cancelSentAt: null, verifyOnly: false,
        });
        expect(result.kind).toBe("success");
        if (result.kind !== "success") throw new Error("Expected a scheduled recovery continuation");
        expect(result.continuation?.key).toBe("payos:attempt-1:cancel:flow-1:5");
        expect(result.continuation?.payload).toMatchObject({ verifyOnly: true, generation: 5 });
        expect(result.continuation?.dueAt?.getTime()).toBeGreaterThan(Date.now() + 10_000);
    });

    it("splits the initial lookup, provider cancellation, and verification into separate tasks", async () => {
        const reconciliation = {
            cancelPendingCheckoutForTask: vi.fn().mockResolvedValue({ outcome: "CANCEL_REQUIRED", paymentLinkId: "link-1" }),
            cancelPayOSLinkForTask: vi.fn().mockResolvedValue({ outcome: "PENDING", verifyOnly: true, cancelSentAt: new Date().toISOString() }),
            reconcilePendingCheckoutForTask: vi.fn(),
        };
        const processor = new PayOSReconciliationTaskProcessor(reconciliation as never);
        const payload = {
            attemptId: "attempt-1", pendingCheckoutId: 7, generation: 0,
            expiresAt: new Date(Date.now() + 12 * 60 * 60_000).toISOString(),
            operation: "CANCEL", cancelRequestedAt: new Date().toISOString(), flowId: "flow-2",
        };
        const first = await processor.process({ payload } as never);

        expect(reconciliation.cancelPendingCheckoutForTask).toHaveBeenCalledTimes(1);
        expect(reconciliation.cancelPayOSLinkForTask).not.toHaveBeenCalled();
        if (first.kind !== "success") throw new Error("Expected a cancel task continuation");
        expect(first.continuation?.payload).toMatchObject({ operation: "CANCEL_LINK", paymentLinkId: "link-1" });
        expect(first.continuation?.key).toBe("payos:attempt-1:cancel:flow-2:1");

        const second = await processor.process({ payload: first.continuation?.payload } as never);
        expect(reconciliation.cancelPayOSLinkForTask).toHaveBeenCalledWith({
            pendingCheckoutId: 7, attemptId: "attempt-1", paymentLinkId: "link-1",
        });
        expect(reconciliation.cancelPendingCheckoutForTask).toHaveBeenCalledTimes(1);
        if (second.kind !== "success") throw new Error("Expected a verification task continuation");
        expect(second.continuation?.payload).toMatchObject({ operation: "CANCEL", verifyOnly: true });
        expect(second.continuation?.dueAt?.getTime()).toBeLessThan(Date.now() + 25_000);
    });
});
