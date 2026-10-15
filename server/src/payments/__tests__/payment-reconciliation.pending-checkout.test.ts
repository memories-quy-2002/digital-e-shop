import { beforeEach, describe, expect, it, vi } from "vitest";
import { PaymentReconciliationRepository } from "../payment-reconciliation.repository";
import { PaymentReconciliationService } from "../payment-reconciliation.service";
import { PaymentAttemptRepository } from "../payment-attempt.repository";
import { PaymentAttemptService } from "../payment-attempt.service";

const { withTransaction } = vi.hoisted(() => ({ withTransaction: vi.fn() }));

vi.mock("../../database/transaction", () => ({ withTransaction }));

describe("PaymentReconciliationService pending checkout finalization", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        withTransaction.mockImplementation(async (work: (tx: unknown) => Promise<unknown>) => work({ query: vi.fn() }));
    });

    it("records a successful finalized pending checkout against only the resulting order payment", async () => {
        const repository = {
            listCandidates: vi.fn().mockResolvedValue({
                candidates: [{
                    target_type: "pending_checkout",
                    target_id: 11,
                    provider: "payos",
                    local_status: "PENDING",
                    reconciliation_status: "PENDING",
                    provider_reference: "link-123",
                    provider_order_code: 123456,
                    payment_amount: 250000,
                    payment_currency: "VND",
                }],
                pagination: { page: 1, limit: 1, total: 1, totalPages: 1 },
            }),
            getPendingCheckoutForUpdate: vi.fn().mockResolvedValue({
                id: 11,
                payment_provider: "payos",
                provider_reference: "link-123",
                provider_order_code: 123456,
                payment_amount: 250000,
                payment_currency: "VND",
                status: "PENDING",
            }),
            getOrderPaymentByOrderId: vi.fn().mockResolvedValue({ id: 22 }),
            recordAttempt: vi.fn().mockImplementation(async (_tx: unknown, input: { pendingCheckoutId?: number; orderPaymentId?: number }) => {
                if ((input.pendingCheckoutId == null) === (input.orderPaymentId == null)) {
                    throw new Error("Exactly one reconciliation target is required");
                }
                return { insertId: 1, affectedRows: 1 };
            }),
            projectReconciliation: vi.fn().mockResolvedValue(undefined),
        };
        const ordersService = {
            finalizePayOSCheckout: vi.fn().mockResolvedValue({ id: 42 }),
        };
        const payosService = {
            getPaymentLink: vi.fn().mockResolvedValue({
                orderCode: 123456,
                paymentLinkId: "link-123",
                amount: 250000,
                amountPaid: 250000,
                currency: "VND",
                status: "PAID",
            }),
        };
        const service = new PaymentReconciliationService(repository as never, ordersService as never, payosService as never);

        const result = await service.runReconciliation({ limit: 1, requestedBy: "admin@example.com" });

        expect(result.results).toEqual([{
            targetType: "pending_checkout",
            targetId: 11,
            paymentId: 22,
            outcome: "MATCHED",
        }]);
        expect(repository.recordAttempt).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                pendingCheckoutId: undefined,
                orderPaymentId: 22,
                outcome: "MATCHED",
            }),
        );
        expect(repository.projectReconciliation).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ orderPaymentId: 22, reconciliationStatus: "MATCHED" }),
        );
    });

    it("records provider lookup evidence without treating normalized currency as independent evidence", async () => {
        const repository = {
            listCandidates: vi.fn().mockResolvedValue({
                candidates: [{ target_type: "pending_checkout", target_id: 11, provider: "payos", local_status: "PENDING", provider_order_code: 123456, payment_amount: 250000, payment_currency: "VND" }],
                pagination: { page: 1, limit: 1, total: 1, totalPages: 1 },
            }),
            getPendingCheckoutForUpdate: vi.fn().mockResolvedValue({
                id: 11, payment_provider: "payos", provider_reference: null, provider_order_code: 123456,
                payment_amount: 250000, payment_currency: "VND", status: "PENDING",
            }),
            findPaymentAttemptByProviderOrderCode: vi.fn().mockResolvedValue({
                id: "attempt-1", providerOrderCode: "123456", providerLinkId: null, expectedAmountVnd: 250000,
            }),
            getOrderPaymentByOrderId: vi.fn().mockResolvedValue({ id: 22 }),
            recordAttempt: vi.fn().mockResolvedValue({ insertId: 1, affectedRows: 1 }),
            projectReconciliation: vi.fn().mockResolvedValue(undefined),
        };
        const ordersService = { finalizePayOSCheckout: vi.fn().mockResolvedValue({ id: 42 }) };
        const payosService = { getPaymentLink: vi.fn().mockResolvedValue({
            orderCode: 123456, paymentLinkId: "link-123", amount: 250000, amountPaid: 250000, currency: "VND", status: "PAID",
        }) };
        const attempts = { recordObservation: vi.fn().mockResolvedValue({
            id: "attempt-1", paymentState: "PAID", orderState: "NOT_CREATED", resolutionState: "NONE", verifiedReceivedAmountVnd: 250000, orderId: null, inserted: true, conflicting: false,
        }) };
        const service = new PaymentReconciliationService(repository as never, ordersService as never, payosService as never, attempts as never);

        const result = await service.runReconciliation({ limit: 1 });

        expect(result.results).toMatchObject([{ outcome: "MATCHED" }]);
        expect(attempts.recordObservation).toHaveBeenCalledWith(expect.objectContaining({
            attemptId: "attempt-1", source: "LOOKUP", sourceKey: expect.any(String), providerOrderCode: "123456",
            providerLinkId: "link-123", expectedAmountVnd: 250000, reportedAmountVnd: 250000,
            paidAmountVnd: 250000, currency: null, normalizedStatus: "PAID", verified: true,
        }));
        expect(ordersService.finalizePayOSCheckout).toHaveBeenCalledWith(123456, "link-123", 250000, "attempt-1");
    });

    it("accepts an exact GET receipt through the real attempt service and repository", async () => {
        const lockedAttempt = {
            id: "attempt-1", payment_state: "PENDING", order_state: "NOT_CREATED", resolution_state: "NONE", order_id: null,
            verified_received_amount_vnd: 0, provider_order_code: "123456", provider_link_id: null, expected_amount_vnd: 250000,
        };
        const projectedAttempt = { ...lockedAttempt, payment_state: "PAID", verified_received_amount_vnd: 250000 };
        const attemptTx = vi.fn()
            .mockResolvedValueOnce([lockedAttempt])
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce({ insertId: 1, affectedRows: 1 })
            .mockResolvedValueOnce({ affectedRows: 1 })
            .mockResolvedValueOnce({ affectedRows: 1 })
            .mockResolvedValueOnce([projectedAttempt]);
        const attemptLookupTx = vi.fn().mockResolvedValueOnce([{
            id: "attempt-1", pending_checkout_id: 11, provider_order_code: "123456", provider_link_id: null, expected_amount_vnd: 250000,
        }]);
        let transactionIndex = 0;
        withTransaction.mockImplementation(async (work: (tx: unknown) => Promise<unknown>) => {
            const query = transactionIndex === 2 ? attemptLookupTx : transactionIndex === 3 ? attemptTx : vi.fn();
            transactionIndex += 1;
            return work({ query });
        });

        const paymentReconciliationRepository = new PaymentReconciliationRepository();
        const repository = {
            listCandidates: vi.fn().mockResolvedValue({
                candidates: [{ target_type: "pending_checkout", target_id: 11, provider: "payos", local_status: "PENDING", provider_order_code: 123456, payment_amount: 250000, payment_currency: "VND" }],
                pagination: { page: 1, limit: 1, total: 1, totalPages: 1 },
            }),
            getPendingCheckoutForUpdate: vi.fn().mockResolvedValue({
                id: 11, payment_provider: "payos", provider_reference: null, provider_order_code: 123456,
                payment_amount: 250000, payment_currency: "VND", status: "PENDING",
            }),
            findPaymentAttemptByProviderOrderCode: vi.fn().mockImplementation((tx: unknown, code: string) =>
                paymentReconciliationRepository.findPaymentAttemptByProviderOrderCode(tx as never, code)),
            getOrderPaymentByOrderId: vi.fn().mockResolvedValue({ id: 22 }),
            recordAttempt: vi.fn().mockResolvedValue({ insertId: 1, affectedRows: 1 }),
            projectReconciliation: vi.fn().mockResolvedValue(undefined),
        };
        const ordersService = { finalizePayOSCheckout: vi.fn().mockResolvedValue({ id: 42 }) };
        const payosService = { getPaymentLink: vi.fn().mockResolvedValue({
            orderCode: 123456, paymentLinkId: "link-123", amount: 250000, amountPaid: 250000, currency: "VND", status: "PAID",
        }) };
        const attempts = new PaymentAttemptService(new PaymentAttemptRepository());
        const service = new PaymentReconciliationService(repository as never, ordersService as never, payosService as never, attempts);

        const result = await service.runReconciliation({ limit: 1 });

        expect(result.results).toMatchObject([{ outcome: "MATCHED" }]);
        expect(attemptTx.mock.calls[2][1][1]).toBe("LOOKUP");
        expect(attemptTx.mock.calls[2][1][9]).toBeNull();
        expect(attemptTx.mock.calls[3][0]).toContain("UPDATE payment_attempts SET provider_link_id");
        expect(ordersService.finalizePayOSCheckout).toHaveBeenCalledWith(123456, "link-123", 250000, "attempt-1");
    });

    it("does not finalize a pending provider lookup", async () => {
        const repository = {
            listCandidates: vi.fn().mockResolvedValue({
                candidates: [{ target_type: "pending_checkout", target_id: 11, provider: "payos", local_status: "PENDING", provider_order_code: 123456, payment_amount: 250000, payment_currency: "VND" }],
                pagination: { page: 1, limit: 1, total: 1, totalPages: 1 },
            }),
            getPendingCheckoutForUpdate: vi.fn().mockResolvedValue({
                id: 11, payment_provider: "payos", provider_reference: null, provider_order_code: 123456,
                payment_amount: 250000, payment_currency: "VND", status: "PENDING",
            }),
            findPaymentAttemptByProviderOrderCode: vi.fn().mockResolvedValue({
                id: "attempt-1", providerOrderCode: "123456", providerLinkId: null, expectedAmountVnd: 250000,
            }),
            recordAttempt: vi.fn().mockResolvedValue({ insertId: 2, affectedRows: 1 }),
        };
        const ordersService = { finalizePayOSCheckout: vi.fn() };
        const payosService = { getPaymentLink: vi.fn().mockResolvedValue({
            orderCode: 123456, paymentLinkId: "link-123", amount: 250000, amountPaid: 0, currency: "VND", status: "PENDING",
        }) };
        const attempts = { recordObservation: vi.fn().mockResolvedValue({
            id: "attempt-1", paymentState: "PENDING", orderState: "NOT_CREATED", resolutionState: "NONE", verifiedReceivedAmountVnd: 0, orderId: null, inserted: true, conflicting: false,
        }) };
        const service = new PaymentReconciliationService(repository as never, ordersService as never, payosService as never, attempts as never);

        const result = await service.runReconciliation({ limit: 1, requestedBy: "admin-1" });

        expect(result.results).toMatchObject([{ outcome: "PENDING" }]);
        expect(attempts.recordObservation).toHaveBeenCalledWith(expect.objectContaining({ normalizedStatus: "PENDING", paidAmountVnd: 0 }));
        expect(repository.recordAttempt).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
            pendingCheckoutId: 11, requestedBy: "admin-1", outcome: "PENDING", providerStatus: "PENDING", mismatchReason: null,
        }));
        expect(ordersService.finalizePayOSCheckout).not.toHaveBeenCalled();
    });

    it.each([["CANCELLED", null], ["EXPIRED", 0]] as const)("releases pending checkout and promotion holds after verified %s lookup", async (status, amountPaid) => {
        const repository = {
            listCandidates: vi.fn().mockResolvedValue({
                candidates: [{ target_type: "pending_checkout", target_id: 11, provider: "payos", local_status: "PENDING", provider_order_code: 123456, payment_amount: 250000, payment_currency: "VND" }],
                pagination: { page: 1, limit: 1, total: 1, totalPages: 1 },
            }),
            getPendingCheckoutForUpdate: vi.fn().mockResolvedValue({
                id: 11, payment_provider: "payos", provider_reference: "link-123", provider_order_code: 123456,
                payment_amount: 250000, payment_currency: "VND", status: "PENDING",
            }),
            findPaymentAttemptByProviderOrderCode: vi.fn().mockResolvedValue({
                id: "attempt-1", pendingCheckoutId: 11, providerOrderCode: "123456", providerLinkId: "link-123", expectedAmountVnd: 250000,
            }),
            getPaymentAttemptForUpdate: vi.fn().mockResolvedValue({
                id: "attempt-1", pendingCheckoutId: 11, orderId: null, cancelRequestedAt: new Date(),
                paymentState: status, verifiedReceivedAmountVnd: 0,
            }),
            recordAttempt: vi.fn().mockResolvedValue({ insertId: 1, affectedRows: 1 }),
        };
        const payosService = { getPaymentLink: vi.fn().mockResolvedValue({
            orderCode: 123456, paymentLinkId: "link-123", amount: 250000, amountPaid, currency: "VND", status,
        }) };
        const paymentAttempts = {
            recordObservation: vi.fn().mockResolvedValue({ paymentState: status, orderState: "NOT_CREATED", resolutionState: "NONE", orderId: null, conflicting: false }),
            releaseCancelledCheckout: vi.fn().mockResolvedValue(undefined),
        };
        const ordersService = { finalizePayOSCheckout: vi.fn() };
        const service = new PaymentReconciliationService(repository as never, ordersService as never, payosService as never, paymentAttempts as never);

        const result = await service.runReconciliation({ limit: 1 });

        expect(result.results).toMatchObject([{ outcome: "PENDING" }]);
        expect(repository.getPaymentAttemptForUpdate).toHaveBeenCalledWith(expect.anything(), "attempt-1");
        expect(paymentAttempts.releaseCancelledCheckout).toHaveBeenCalledWith(11, expect.anything());
        expect(ordersService.finalizePayOSCheckout).not.toHaveBeenCalled();
    });

    it.each([["positive", 1], ["unsafe", Number.MAX_SAFE_INTEGER + 1]] as const)("does not release on cancellation with %s paid amount", async (_label, amountPaid) => {
        const repository = {
            listCandidates: vi.fn().mockResolvedValue({
                candidates: [{ target_type: "pending_checkout", target_id: 11, provider: "payos", local_status: "PENDING", provider_order_code: 123456, payment_amount: 250000, payment_currency: "VND" }],
                pagination: { page: 1, limit: 1, total: 1, totalPages: 1 },
            }),
            getPendingCheckoutForUpdate: vi.fn().mockResolvedValue({
                id: 11, payment_provider: "payos", provider_reference: "link-123", provider_order_code: 123456,
                payment_amount: 250000, payment_currency: "VND", status: "PENDING",
            }),
            findPaymentAttemptByProviderOrderCode: vi.fn().mockResolvedValue({
                id: "attempt-1", pendingCheckoutId: 11, providerOrderCode: "123456", providerLinkId: "link-123", expectedAmountVnd: 250000,
            }),
            getPaymentAttemptForUpdate: vi.fn(),
            recordAttempt: vi.fn().mockResolvedValue({ insertId: 1, affectedRows: 1 }),
        };
        const payosService = { getPaymentLink: vi.fn().mockResolvedValue({
            orderCode: 123456, paymentLinkId: "link-123", amount: 250000, amountPaid, currency: "VND", status: "CANCELLED",
        }) };
        const paymentAttempts = {
            recordObservation: vi.fn().mockResolvedValue({ paymentState: "CANCELLED", orderState: "NOT_CREATED", resolutionState: "NONE", orderId: null, conflicting: false }),
            releaseCancelledCheckout: vi.fn(),
        };
        const ordersService = { finalizePayOSCheckout: vi.fn() };
        const service = new PaymentReconciliationService(repository as never, ordersService as never, payosService as never, paymentAttempts as never);

        const result = await service.runReconciliation({ limit: 1 });

        expect(result.results).toMatchObject([{ outcome: "MISMATCH" }]);
        expect(repository.getPaymentAttemptForUpdate).not.toHaveBeenCalled();
        expect(paymentAttempts.releaseCancelledCheckout).not.toHaveBeenCalled();
        expect(ordersService.finalizePayOSCheckout).not.toHaveBeenCalled();
    });

    it("does not release holds when a PAID receipt wins the lock after cancellation observation", async () => {
        const repository = {
            listCandidates: vi.fn().mockResolvedValue({
                candidates: [{ target_type: "pending_checkout", target_id: 11, provider: "payos", local_status: "PENDING", provider_order_code: 123456, payment_amount: 250000, payment_currency: "VND" }],
                pagination: { page: 1, limit: 1, total: 1, totalPages: 1 },
            }),
            getPendingCheckoutForUpdate: vi.fn().mockResolvedValue({
                id: 11, payment_provider: "payos", provider_reference: "link-123", provider_order_code: 123456,
                payment_amount: 250000, payment_currency: "VND", status: "PENDING",
            }),
            findPaymentAttemptByProviderOrderCode: vi.fn().mockResolvedValue({
                id: "attempt-1", pendingCheckoutId: 11, providerOrderCode: "123456", providerLinkId: "link-123", expectedAmountVnd: 250000,
            }),
            getPaymentAttemptForUpdate: vi.fn().mockResolvedValue({
                id: "attempt-1", pendingCheckoutId: 11, orderId: null, cancelRequestedAt: new Date(),
                paymentState: "PAID", verifiedReceivedAmountVnd: 250000,
            }),
            markPaymentAttemptReviewRequired: vi.fn(),
            recordAttempt: vi.fn().mockResolvedValue({ insertId: 1, affectedRows: 1 }),
        };
        const payosService = { getPaymentLink: vi.fn().mockResolvedValue({
            orderCode: 123456, paymentLinkId: "link-123", amount: 250000, amountPaid: 0, currency: "VND", status: "CANCELLED",
        }) };
        const paymentAttempts = {
            recordObservation: vi.fn().mockResolvedValue({ paymentState: "CANCELLED", orderState: "NOT_CREATED", resolutionState: "NONE", orderId: null, conflicting: false }),
            releaseCancelledCheckout: vi.fn(),
        };
        const ordersService = { finalizePayOSCheckout: vi.fn() };
        const service = new PaymentReconciliationService(repository as never, ordersService as never, payosService as never, paymentAttempts as never);

        const result = await service.runReconciliation({ limit: 1 });

        expect(result.results).toMatchObject([{ outcome: "MISMATCH" }]);
        expect(repository.getPaymentAttemptForUpdate).toHaveBeenCalledWith(expect.anything(), "attempt-1");
        expect(repository.markPaymentAttemptReviewRequired).toHaveBeenCalledWith(expect.anything(), "attempt-1");
        expect(paymentAttempts.releaseCancelledCheckout).not.toHaveBeenCalled();
        expect(ordersService.finalizePayOSCheckout).not.toHaveBeenCalled();
    });
});
