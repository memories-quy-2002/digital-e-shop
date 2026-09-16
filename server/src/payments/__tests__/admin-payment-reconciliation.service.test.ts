import { beforeEach, describe, expect, it, vi } from "vitest";

const { withTransaction } = vi.hoisted(() => ({ withTransaction: vi.fn() }));
vi.mock("../../database/transaction", () => ({ withTransaction }));

import { PaymentReconciliationService } from "../payment-reconciliation.service";

describe("PaymentReconciliationService admin operations", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        withTransaction.mockImplementation(async (work: (tx: unknown) => Promise<unknown>) => work({ query: vi.fn() }));
    });

    it("recovers an exact PAID pending PayOS checkout and projects MATCHED after finalization", async () => {
        const repository = {
            listCandidates: vi.fn().mockResolvedValue({ candidates: [{ target_type: "pending_checkout", target_id: 7, provider: "payos" }] }),
            getPendingCheckoutForUpdate: vi.fn().mockResolvedValue({ id: 7, payment_provider: "payos", provider_order_code: 123456, provider_reference: "link-123", payment_amount: 250000, payment_currency: "VND", status: "PENDING" }),
            recordAttempt: vi.fn(),
            getOrderPaymentByOrderId: vi.fn().mockResolvedValue({ id: 42 }),
            getOrderPaymentForUpdate: vi.fn().mockResolvedValue({ id: 42, order_id: 99, provider: "payos", status: "paid", provider_reference: "123456", provider_payment_id: "link-123", amount: 250000, currency: "VND", reconciliation_status: "PENDING" }),
            projectReconciliation: vi.fn(),
        };
        const payosService = { getPaymentLink: vi.fn().mockResolvedValue({ orderCode: 123456, paymentLinkId: "link-123", amount: 250000, amountPaid: 250000, currency: "VND", status: "PAID" }) };
        const ordersService = { finalizePayOSCheckout: vi.fn().mockResolvedValue({ id: 99 }) };
        const service = new PaymentReconciliationService(repository as never, ordersService as never, payosService as never);

        await expect(service.runReconciliation({ limit: 1, requestedBy: "admin-1" })).resolves.toMatchObject({ results: [{ outcome: "MATCHED", targetId: 7, paymentId: 42 }] });
        expect(payosService.getPaymentLink).toHaveBeenCalledWith({ orderCode: 123456 });
        expect(ordersService.finalizePayOSCheckout).toHaveBeenCalledWith(123456, "link-123", 250000);
        expect(repository.recordAttempt).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ pendingCheckoutId: undefined, orderPaymentId: 42, outcome: "MATCHED", requestedBy: "admin-1" }));
        expect(repository.projectReconciliation).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ orderPaymentId: 42, reconciliationStatus: "MATCHED" }));
    });

    it("persists a PayOS amount mismatch without finalizing or marking payment paid", async () => {
        const repository = {
            getOrderPaymentForUpdate: vi.fn().mockResolvedValue({ id: 42, provider: "payos", status: "pending", provider_reference: "123456", provider_payment_id: "link-123", amount: 250000, currency: "VND", reconciliation_status: "PENDING" }),
            recordAttempt: vi.fn(),
            projectReconciliation: vi.fn(),
        };
        const payosService = { getPaymentLink: vi.fn().mockResolvedValue({ orderCode: 123456, paymentLinkId: "link-123", amount: 250001, amountPaid: 250001, currency: "VND", status: "PAID" }) };
        const ordersService = { finalizePayOSCheckout: vi.fn() };
        const service = new PaymentReconciliationService(repository as never, ordersService as never, payosService as never);

        await expect(service.reconcilePayment(42, "admin-1")).resolves.toMatchObject({ outcome: "MISMATCH" });
        expect(ordersService.finalizePayOSCheckout).not.toHaveBeenCalled();
        expect(repository.recordAttempt).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ orderPaymentId: 42, outcome: "MISMATCH", expectedAmount: 250000, providerAmount: 250001 }));
        expect(repository.projectReconciliation).not.toHaveBeenCalled();
    });

    it.each([
        { name: "status", provider: { orderCode: 123456, paymentLinkId: "link-123", amount: 250000, amountPaid: 250000, currency: "VND", status: "PENDING" } },
        { name: "order code", provider: { orderCode: 123457, paymentLinkId: "link-123", amount: 250000, amountPaid: 250000, currency: "VND", status: "PAID" } },
        { name: "payment link", provider: { orderCode: 123456, paymentLinkId: "link-other", amount: 250000, amountPaid: 250000, currency: "VND", status: "PAID" } },
        { name: "currency", provider: { orderCode: 123456, paymentLinkId: "link-123", amount: 250000, amountPaid: 250000, currency: "USD", status: "PAID" } },
        { name: "paid amount", provider: { orderCode: 123456, paymentLinkId: "link-123", amount: 250000, amountPaid: 249999, currency: "VND", status: "PAID" } },
    ])("keeps the existing projection for a PayOS $name mismatch", async ({ provider }) => {
        const repository = {
            getOrderPaymentForUpdate: vi.fn().mockResolvedValue({ id: 42, order_id: 99, provider: "payos", status: "pending", provider_reference: "123456", provider_payment_id: "link-123", amount: 250000, currency: "VND", reconciliation_status: "MATCHED", provider_status: "PAID" }),
            recordAttempt: vi.fn(),
            projectReconciliation: vi.fn(),
        };
        const payosService = { getPaymentLink: vi.fn().mockResolvedValue(provider) };
        const ordersService = { finalizePayOSCheckout: vi.fn() };
        const service = new PaymentReconciliationService(repository as never, ordersService as never, payosService as never);

        await expect(service.reconcilePayment(42, "admin-1")).resolves.toMatchObject({ outcome: "MISMATCH" });
        expect(ordersService.finalizePayOSCheckout).not.toHaveBeenCalled();
        expect(repository.projectReconciliation).not.toHaveBeenCalled();
        expect(repository.recordAttempt).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ outcome: "MISMATCH" }));
    });

    it("records provider unavailability without changing the payment projection", async () => {
        const repository = {
            getOrderPaymentForUpdate: vi.fn().mockResolvedValue({ id: 42, order_id: 99, provider: "payos", status: "pending", provider_reference: "123456", provider_payment_id: "link-123", amount: 250000, currency: "VND", reconciliation_status: "MATCHED", provider_status: "PAID" }),
            recordAttempt: vi.fn(),
            projectReconciliation: vi.fn(),
        };
        const payosService = { getPaymentLink: vi.fn().mockRejectedValue(new Error("provider timeout")) };
        const service = new PaymentReconciliationService(repository as never, { finalizePayOSCheckout: vi.fn() } as never, payosService as never);

        await expect(service.reconcilePayment(42, "admin-1")).rejects.toMatchObject({ statusCode: 503 });
        expect(repository.recordAttempt).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ outcome: "UNAVAILABLE" }));
        expect(repository.projectReconciliation).not.toHaveBeenCalled();
    });

    it("does not finalize or project a stale provider result after order-payment revalidation", async () => {
        const original = { id: 42, order_id: 99, provider: "payos", status: "pending", provider_reference: "123456", provider_payment_id: "link-123", amount: 250000, currency: "VND", reconciliation_status: "PENDING" };
        const changed = { ...original, provider_reference: "999999" };
        const repository = {
            getOrderPaymentForUpdate: vi.fn().mockResolvedValueOnce(original).mockResolvedValue(changed),
            recordAttempt: vi.fn(),
            projectReconciliation: vi.fn(),
        };
        const payosService = { getPaymentLink: vi.fn().mockResolvedValue({ orderCode: 123456, paymentLinkId: "link-123", amount: 250000, amountPaid: 250000, currency: "VND", status: "PAID" }) };
        const ordersService = { finalizePayOSCheckout: vi.fn() };
        const service = new PaymentReconciliationService(repository as never, ordersService as never, payosService as never);

        await expect(service.reconcilePayment(42, "admin-1")).resolves.toMatchObject({ outcome: "MISMATCH" });
        expect(ordersService.finalizePayOSCheckout).not.toHaveBeenCalled();
        expect(repository.recordAttempt).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ outcome: "MISMATCH", mismatchReason: expect.stringContaining("changed") }));
        expect(repository.projectReconciliation).not.toHaveBeenCalled();
    });

    it("returns a hidden payment as not found without contacting PayOS", async () => {
        const repository = { getOrderPaymentForUpdate: vi.fn().mockResolvedValue(null), recordAttempt: vi.fn() };
        const payosService = { getPaymentLink: vi.fn() };
        const service = new PaymentReconciliationService(repository as never, { finalizePayOSCheckout: vi.fn() } as never, payosService as never);

        await expect(service.reconcilePayment(404, "admin-1")).rejects.toMatchObject({ statusCode: 404 });
        expect(payosService.getPaymentLink).not.toHaveBeenCalled();
        expect(repository.recordAttempt).not.toHaveBeenCalled();
    });

    it("confirms only a locked pending cash payment and appends the manual audit attempt", async () => {
        const repository = {
            getOrderPaymentForUpdate: vi.fn().mockResolvedValue({ id: 42, provider: "cash", status: "pending", amount: 250000, currency: "VND", reconciliation_status: "PENDING" }),
            confirmCashPayment: vi.fn().mockResolvedValue({ id: 42, provider: "cash", status: "paid", reconciliation_status: "MANUAL_CONFIRMED", provider_status: "COLLECTED" }),
            recordAttempt: vi.fn(),
        };
        const service = new PaymentReconciliationService(repository as never, { finalizePayOSCheckout: vi.fn() } as never);

        await expect(service.confirmCod(42, { note: "collected at front desk" }, "admin-1")).resolves.toMatchObject({ id: 42, status: "paid", reconciliation_status: "MANUAL_CONFIRMED" });
        expect(repository.confirmCashPayment).toHaveBeenCalledWith(expect.anything(), 42);
        expect(repository.recordAttempt).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ orderPaymentId: 42, requestedBy: "admin-1", outcome: "MANUAL_CONFIRMED", mismatchReason: "collected at front desk" }));
    });

    it("repairs and reads back an already-paid COD payment before auditing confirmation", async () => {
        const repository = {
            getOrderPaymentForUpdate: vi.fn().mockResolvedValue({ id: 42, provider: "cash", status: "paid", amount: 250000, currency: "VND", reconciliation_status: "PENDING", provider_status: null, paid_at: null }),
            confirmCashPayment: vi.fn().mockResolvedValue({ id: 42, provider: "cash", status: "paid", amount: 250000, currency: "VND", reconciliation_status: "MANUAL_CONFIRMED", provider_status: "COLLECTED", paid_at: "2026-09-16 10:00:00" }),
            recordAttempt: vi.fn(),
        };
        const service = new PaymentReconciliationService(repository as never, { finalizePayOSCheckout: vi.fn() } as never);

        await expect(service.confirmCod(42, { note: "  collected  " }, "admin-1")).resolves.toMatchObject({ paid_at: "2026-09-16 10:00:00", reconciliation_status: "MANUAL_CONFIRMED", provider_status: "COLLECTED" });
        expect(repository.confirmCashPayment).toHaveBeenCalledWith(expect.anything(), 42);
        expect(repository.recordAttempt).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ outcome: "MANUAL_CONFIRMED", mismatchReason: "collected" }));
    });

    it("uses the eligible candidate query for an actual reconciliation run", async () => {
        const repository = { listCandidates: vi.fn().mockResolvedValue({ candidates: [] }) };
        const service = new PaymentReconciliationService(repository as never, { finalizePayOSCheckout: vi.fn() } as never);

        await service.runReconciliation({ limit: 10, requestedBy: "admin-1" });

        expect(repository.listCandidates).toHaveBeenCalledWith({ provider: "payos", page: 1, limit: 10 }, expect.anything());
    });

    it("rejects a non-cash payment before any confirmation mutation", async () => {
        const repository = { getOrderPaymentForUpdate: vi.fn().mockResolvedValue({ id: 42, provider: "payos", status: "pending" }), confirmCashPayment: vi.fn(), recordAttempt: vi.fn() };
        const service = new PaymentReconciliationService(repository as never, { finalizePayOSCheckout: vi.fn() } as never);

        await expect(service.confirmCod(42, {}, "admin-1")).rejects.toMatchObject({ statusCode: 409 });
        expect(repository.confirmCashPayment).not.toHaveBeenCalled();
        expect(repository.recordAttempt).not.toHaveBeenCalled();
    });
});
