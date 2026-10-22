import { describe, expect, it, vi } from "vitest";

const { pool } = vi.hoisted(() => ({ pool: { query: vi.fn() } }));
vi.mock("#src/config/database.config", () => ({ default: pool }));

import { InventoryRepository } from "../inventory.repository";

describe("inventory movement document sources", () => {
    it("persists receipt and count source IDs in the caller transaction", async () => {
        const tx = { query: vi.fn().mockResolvedValue(undefined) };
        const repository = new InventoryRepository();

        await repository.createMovementsInTransaction(tx as never, [
            { productId: 7, movementType: "purchase_receipt", quantityChange: 4, purchaseReceiptLineId: 18 },
            { productId: 8, movementType: "stock_count", quantityChange: -2, stockCountItemId: 23 },
        ]);

        expect(tx.query).toHaveBeenCalledWith(
            expect.stringContaining("purchase_receipt_line_id, stock_count_item_id"),
            [[
                [7, null, "purchase_receipt", 4, null, null, null, null, 18, null],
                [8, null, "stock_count", -2, null, null, null, null, null, 23],
            ]],
        );
        expect(pool.query).not.toHaveBeenCalled();
    });
});
