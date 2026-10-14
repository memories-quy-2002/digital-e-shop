import { describe, expect, it, vi } from "vitest";
import { ManualRefundService, manualRefundInputSchema } from "../manual-refund.service";
import type { ManualRefundRepositoryPort } from "../manual-refund.repository";
import type { EvidenceService } from "../../operations/evidence.service";

const input = {
    idempotencyKey: "refund-op-1",
    transferReference: "bank-transfer-1",
    transferDate: "2026-10-14",
    reviewedReason: "Customer return inspected",
    evidenceId: 12,
    currency: "VND",
};

function makeRepository(): ManualRefundRepositoryPort {
    return {
        withTransaction: vi.fn(async (work) => work({} as never)),
        getContextForUpdate: vi.fn().mockResolvedValue({
            request: { id: 5, orderId: 42, status: "RECEIVED" },
            order: { id: 42, currency: "VND", discount: 10_000, pricingSnapshot: null },
            payment: { id: 8, status: "paid", amount: 100_000, refundedAmount: 0, currency: "VND", simulated: 0, paidAt: "2026-10-14T00:00:00Z" },
            items: [{ orderItemId: 7, quantity: 3, requestedQuantity: 3, unitPrice: 30_000 }],
            refundedUnits: [],
        }),
        findOperationByKey: vi.fn().mockResolvedValue(null),
        findOperationByReference: vi.fn().mockResolvedValue(null),
        insertOperation: vi.fn().mockResolvedValue({ id: 22 }),
        completeRefund: vi.fn().mockResolvedValue({ id: 5, orderId: 42, status: "REFUNDED", refundAmount: 80_000, refundCurrency: "VND" }),
    };
}

const makeEvidence = () => ({ store: vi.fn(), readForAdmin: vi.fn().mockResolvedValue({ id: 12, uploadedBy: "admin-1" }) } as unknown as EvidenceService);

describe("ManualRefundService", () => {
    it("records a discount-aware attestation against actually paid balance", async () => {
        const repo = makeRepository();
        const proof = makeEvidence();
        const service = new ManualRefundService(repo, proof);
        await expect(service.confirm(5, "admin-1", input)).resolves.toMatchObject({ status: "REFUNDED", refundAmount: 80_000 });
        expect(repo.insertOperation).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ amountVnd: 80_000 }), expect.any(Array));
        expect(repo.completeRefund).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ amountVnd: 80_000 }));
    });

    it("rejects missing or unowned evidence and does not write", async () => {
        const repo = makeRepository();
        const proof = makeEvidence();
        vi.mocked(proof.readForAdmin).mockRejectedValueOnce(Object.assign(new Error("not owned"), { statusCode: 403 }));
        const service = new ManualRefundService(repo, proof);
        await expect(service.confirm(5, "admin-1", input)).rejects.toMatchObject({ statusCode: 403 });
        expect(repo.insertOperation).not.toHaveBeenCalled();
    });

    it("rejects unpaid/simulated ledgers and unit reuse", async () => {
        const repo = makeRepository();
        const proof = makeEvidence();
        vi.mocked(repo.getContextForUpdate).mockResolvedValueOnce({
            ...(await repo.getContextForUpdate({} as never, 5))!,
            payment: { id: 8, status: "paid", amount: 100_000, refundedAmount: 0, currency: "VND", simulated: 1, paidAt: "2026-10-14T00:00:00Z" },
        } as never);
        const service = new ManualRefundService(repo, proof);
        await expect(service.confirm(5, "admin-1", input)).rejects.toMatchObject({ statusCode: 409 });
        expect(repo.insertOperation).not.toHaveBeenCalled();
    });

    it("rejects already refunded units before recording a second partial operation", async () => {
        const repo = makeRepository();
        vi.mocked(repo.getContextForUpdate).mockResolvedValueOnce({
            ...(await repo.getContextForUpdate({} as never, 5))!,
            refundedUnits: [{ orderItemId: 7, unitIndex: 0 }],
        } as never);
        const service = new ManualRefundService(repo, makeEvidence());
        await expect(service.confirm(5, "admin-1", input)).rejects.toMatchObject({ statusCode: 409 });
        expect(repo.insertOperation).not.toHaveBeenCalled();
    });

    it("rejects a previously used transfer reference", async () => {
        const repo = makeRepository();
        vi.mocked(repo.findOperationByReference).mockResolvedValueOnce({ id: 20, requestId: 4 } as never);
        const service = new ManualRefundService(repo, makeEvidence());
        await expect(service.confirm(5, "admin-1", input)).rejects.toMatchObject({ statusCode: 409 });
        expect(repo.insertOperation).not.toHaveBeenCalled();
    });

    it("rejects invalid calendar dates and non-integer evidence IDs", () => {
        expect(manualRefundInputSchema.safeParse({ ...input, transferDate: "2026-02-31" }).success).toBe(false);
        expect(manualRefundInputSchema.safeParse({ ...input, evidenceId: 1.5 }).success).toBe(false);
    });
});
