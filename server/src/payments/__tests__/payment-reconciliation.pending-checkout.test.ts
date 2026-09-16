import { beforeEach, describe, expect, it, vi } from "vitest";
import { PaymentReconciliationService } from "../payment-reconciliation.service";

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
});
