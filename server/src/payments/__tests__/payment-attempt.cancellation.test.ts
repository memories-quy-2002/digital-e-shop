import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../database/transaction", () => ({ withTransaction: vi.fn((work) => work({})) }));

import { PaymentReconciliationService } from "../payment-reconciliation.service";

const attempt = {
    id: "attempt-1", pendingCheckoutId: 7, providerOrderCode: "123456789", expectedAmountVnd: 250_000,
    providerLinkId: "link-1", cancelRequestedAt: new Date(Date.now() - 60_000).toISOString(), orderState: "CANCEL_PENDING",
};
const providerPending = {
    orderCode: 123456789, paymentLinkId: "link-1", amount: 250_000, amountPaid: 0, status: "PENDING", currency: "VND" as const,
};

function buildService(options: { lookup?: unknown; cancel?: unknown; projections?: unknown[] } = {}) {
    const repository = {
        recordAttempt: vi.fn(),
        getPaymentAttemptForUpdate: vi.fn().mockResolvedValue({
            id: attempt.id, pendingCheckoutId: attempt.pendingCheckoutId, orderId: null, cancelRequestedAt: attempt.cancelRequestedAt,
            paymentState: "CANCELLED", verifiedReceivedAmountVnd: 0,
        }),
        markPaymentAttemptReviewRequired: vi.fn(),
    };
    const payos = {
        getPaymentLink: vi.fn().mockResolvedValue(options.lookup ?? providerPending),
        cancelPaymentLink: vi.fn().mockResolvedValue(options.cancel),
    };
    const observations = options.projections || [
        { paymentState: "PENDING", conflicting: false },
        { paymentState: "PAID", conflicting: false },
    ];
    const paymentAttempts = {
        getCancellationTaskAttempt: vi.fn().mockResolvedValue(attempt),
        recordObservation: vi.fn().mockImplementation(() => Promise.resolve(observations.shift())),
        releaseCancelledCheckout: vi.fn(),
    };
    const orders = { finalizePayOSCheckout: vi.fn() };
    return {
        service: new PaymentReconciliationService(repository as never, orders as never, payos as never, paymentAttempts as never, {} as never),
        repository, payos, paymentAttempts, orders,
    };
}

describe("PayOS cancellation intent processing", () => {
    beforeEach(() => vi.clearAllMocks());

    it("keeps lookup and cancel as separate provider calls and retains a paid cancellation response", async () => {
        const paid = { ...providerPending, amountPaid: 250_000, status: "PAID" };
        const { service, payos, paymentAttempts, orders, repository } = buildService({ cancel: paid });

        await expect(service.cancelPendingCheckoutForTask({ pendingCheckoutId: 7, attemptId: "attempt-1" }))
            .resolves.toEqual({ outcome: "CANCEL_REQUIRED", paymentLinkId: "link-1" });
        expect(payos.cancelPaymentLink).not.toHaveBeenCalled();
        await expect(service.cancelPayOSLinkForTask({ pendingCheckoutId: 7, attemptId: "attempt-1", paymentLinkId: "link-1" }))
            .resolves.toMatchObject({ outcome: "PENDING", verifyOnly: true });
        expect(payos.getPaymentLink).toHaveBeenCalledTimes(1);
        expect(payos.cancelPaymentLink).toHaveBeenCalledTimes(1);
        expect(paymentAttempts.recordObservation).toHaveBeenCalledTimes(2);
        expect(orders.finalizePayOSCheckout).not.toHaveBeenCalled();
        expect(repository.markPaymentAttemptReviewRequired).toHaveBeenCalled();
    });

    it("releases the hold only after a later lookup verifies cancellation and keeps checking for late payment", async () => {
        const { service, payos, paymentAttempts } = buildService({
            lookup: { ...providerPending, status: "CANCELLED" },
            projections: [{ paymentState: "CANCELLED", conflicting: false }],
        });

        await expect(service.cancelPendingCheckoutForTask({ pendingCheckoutId: 7, attemptId: "attempt-1", cancelSentAt: new Date().toISOString() }))
            .resolves.toMatchObject({ outcome: "PENDING", verifyOnly: true });
        expect(payos.cancelPaymentLink).not.toHaveBeenCalled();
        expect(paymentAttempts.releaseCancelledCheckout).toHaveBeenCalledWith(7, expect.anything());
    });

    it("does not treat an unknown provider result as proof of no funds, but releases after timeout and retains 24h recovery", async () => {
        const oldAttempt = { ...attempt, cancelRequestedAt: new Date(Date.now() - 11 * 60_000).toISOString() };
        const { service, payos, paymentAttempts, repository } = buildService({ lookup: new Error("provider unavailable") });
        vi.mocked(paymentAttempts.getCancellationTaskAttempt).mockResolvedValue(oldAttempt as never);
        vi.mocked(payos.getPaymentLink).mockRejectedValue(new Error("provider unavailable"));

        await expect(service.cancelPendingCheckoutForTask({ pendingCheckoutId: 7, attemptId: "attempt-1" }))
            .resolves.toMatchObject({ outcome: "PENDING", verifyOnly: true });
        expect(paymentAttempts.releaseCancelledCheckout).toHaveBeenCalledWith(7, expect.anything());
        expect(repository.markPaymentAttemptReviewRequired).toHaveBeenCalled();
    });

    it("keeps late verified paid evidence exceptional without finalizing or releasing before timeout", async () => {
        const { service, paymentAttempts, orders, repository } = buildService({
            lookup: { ...providerPending, amountPaid: 250_000, status: "PAID" },
            projections: [{ paymentState: "PAID", conflicting: false }],
        });

        await expect(service.cancelPendingCheckoutForTask({ pendingCheckoutId: 7, attemptId: "attempt-1" }))
            .resolves.toMatchObject({ outcome: "PENDING", verifyOnly: true });
        expect(orders.finalizePayOSCheckout).not.toHaveBeenCalled();
        expect(paymentAttempts.releaseCancelledCheckout).not.toHaveBeenCalled();
        expect(repository.markPaymentAttemptReviewRequired).toHaveBeenCalled();
    });
});
