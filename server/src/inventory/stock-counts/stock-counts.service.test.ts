import { describe, expect, it, vi } from "vitest";
import { StockCountsService } from "./stock-counts.service";
import type { StockCountsRepository } from "./stock-counts.repository";
import type { ProductAlertsService } from "../../product-alerts/product-alerts.service";
import type { NestInventoryService } from "../inventory.service";

describe("StockCountsService approval", () => {
    it("rejects reservation shortfalls before stock, movement, or approval writes", async () => {
        const item = {
            id: 4, productId: 8, sku: "SKU-8", productName: "Keyboard", baselineStock: 10, baselineRevision: "2",
            countedQuantity: 3, reason: "Damaged goods", difference: -7, activeReservedQuantity: 4,
        };
        const repository = {
            withTransaction: vi.fn(async (work: (tx: object) => Promise<unknown>) => work({})),
            lockHeader: vi.fn().mockResolvedValue({ status: "SUBMITTED", version: 3 }),
            lockItems: vi.fn().mockResolvedValue([item]),
            lockProducts: vi.fn().mockResolvedValue([{ productId: 8, id: 8, sku: "SKU-8", name: "Keyboard", stock: 10, stockRevision: "2", price: 100, salePrice: null, active: true }]),
            activeReservations: vi.fn().mockResolvedValue(new Map([[8, 4]])),
            writeCountedStock: vi.fn(),
            audit: vi.fn(),
        };
        const inventory = { createMovementsInTransaction: vi.fn() };
        const service = new StockCountsService(repository as unknown as StockCountsRepository, {} as ProductAlertsService, inventory as unknown as NestInventoryService);

        await expect(service.transition("admin-1", 2, "approve", { version: 3 })).rejects.toMatchObject({ code: "STOCK_COUNT_CONFLICT", statusCode: 409 });
        expect(repository.writeCountedStock).not.toHaveBeenCalled();
        expect(inventory.createMovementsInTransaction).not.toHaveBeenCalled();
        expect(repository.audit).not.toHaveBeenCalled();
    });
});
