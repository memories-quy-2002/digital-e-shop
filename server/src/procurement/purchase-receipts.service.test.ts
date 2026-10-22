import { describe, expect, it, vi } from "vitest";
import { PurchaseReceiptsService } from "./purchase-receipts.service";
import type { PurchaseReceiptsRepository } from "./purchase-receipts.repository";
import type { ProductAlertsService } from "../product-alerts/product-alerts.service";

const input = {
    idempotencyKey: "e791b4c4-b9bb-4268-a6e6-7d0270714c57",
    note: "  morning delivery  ",
    lines: [{ purchaseOrderItemId: 5, expectedQuantity: 2, acceptedQuantity: 2, rejectedQuantity: 0, missingQuantity: 0, unitCostVnd: 120 }],
};
const receipt = { id: 9, purchaseOrderId: 3, idempotencyKey: input.idempotencyKey, actorId: "admin-1", note: null, totalAcceptedCostVnd: 240, createdAt: "2026-10-21T00:00:00Z", lines: [] };

describe("PurchaseReceiptsService idempotency", () => {
    it("returns the existing receipt for a canonical payload retry", async () => {
        const repository = {
            withTransaction: vi.fn(async (work: (tx: object) => Promise<number>) => work({})),
            lockPurchaseOrder: vi.fn().mockResolvedValue({ id: 3, status: "ORDERED", version: 1, lines: [] }),
            findByIdempotencyKey: vi.fn().mockResolvedValue({ payloadHash: "", receipt }),
            getReceipt: vi.fn().mockResolvedValue(receipt),
        };
        const service = new PurchaseReceiptsService(repository as unknown as PurchaseReceiptsRepository, {} as ProductAlertsService, {} as never);
        const { receiptPayloadHashInput } = await import("./receipt.policy");
        const { createHash } = await import("node:crypto");
        const expectedHash = createHash("sha256").update(JSON.stringify(receiptPayloadHashInput(input))).digest("hex");
        repository.findByIdempotencyKey.mockResolvedValue({ payloadHash: expectedHash, receipt });

        await expect(service.post("admin-1", 3, { ...input, note: "morning delivery" })).resolves.toEqual(receipt);
        expect(repository.getReceipt).toHaveBeenCalledWith(receipt.id);
    });

    it("rejects reuse of a key for a different canonical payload", async () => {
        const repository = {
            withTransaction: vi.fn(async (work: (tx: object) => Promise<number>) => work({})),
            lockPurchaseOrder: vi.fn().mockResolvedValue({ id: 3, status: "ORDERED", version: 1, lines: [] }),
            findByIdempotencyKey: vi.fn().mockResolvedValue({ payloadHash: "different", receipt }),
            getReceipt: vi.fn(),
        };
        const service = new PurchaseReceiptsService(repository as unknown as PurchaseReceiptsRepository, {} as ProductAlertsService, {} as never);

        await expect(service.post("admin-1", 3, input)).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_CONFLICT", statusCode: 409 });
        expect(repository.getReceipt).not.toHaveBeenCalled();
    });
});
