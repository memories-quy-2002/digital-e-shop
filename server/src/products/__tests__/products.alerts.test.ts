import { describe, expect, it, vi } from "vitest";

const { withTransaction } = vi.hoisted(() => ({ withTransaction: vi.fn() }));

vi.mock("../../database/transaction", () => ({ withTransaction }));
vi.mock("#src/config/database.config", () => ({ default: { query: vi.fn() } }));
vi.mock("../products.repository", () => ({ NestProductsRepository: class {} }));
vi.mock("#src/shared/utils/logger", () => ({
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { NestProductsService } from "../products.service";

const product = (overrides: Record<string, unknown> = {}) => ({
    id: 7,
    name: "Example GPU",
    description: "GPU",
    category: "Components",
    brand: "Digital-E",
    specifications: "",
    sku: "GPU-000007",
    manufacturer_part_number: null,
    warranty_months: null,
    price: 100,
    sale_price: null,
    stock: 4,
    ...overrides,
});

function buildService({
    lockedProduct = product(),
    alerts = { recordTransitionsInTransaction: vi.fn().mockResolvedValue(undefined) },
} = {}) {
    const tx = { query: vi.fn() };
    tx.query.mockImplementation(async (sql: string) => {
        if (sql.includes("SELECT price, sale_price, stock")) return [lockedProduct];
        if (sql.includes("SELECT id FROM categories")) return [{ id: 1 }];
        if (sql.includes("SELECT id FROM brands")) return [{ id: 2 }];
        return { affectedRows: 1 };
    });
    withTransaction.mockImplementation(async (work: (transaction: typeof tx) => Promise<unknown>) => work(tx));

    const repository = { getProductById: vi.fn().mockResolvedValue(product(lockedProduct)) };
    const inventory = { createMovementsInTransaction: vi.fn().mockResolvedValue(undefined) };
    const attributes = { replaceForProduct: vi.fn().mockResolvedValue(undefined) };
    const service = new NestProductsService(
        repository as never,
        inventory as never,
        attributes as never,
        alerts as never,
    );

    return { service, tx, repository, inventory, alerts };
}

describe("product alert transitions in admin product writes", () => {
    it("emits back-in-stock from the locked 0 -> 8 inventory transition", async () => {
        const { service, alerts } = buildService({ lockedProduct: product({ stock: 0 }) });

        await service.updateInventoryService(7, 8);

        expect(alerts.recordTransitionsInTransaction).toHaveBeenCalledWith(
            expect.anything(),
            [expect.objectContaining({
                type: "back_in_stock",
                productId: 7,
                previousStock: 0,
                currentStock: 8,
            })],
        );
    });

    it("emits a price drop using the locked price snapshot, not a stale read", async () => {
        const { service, alerts } = buildService({ lockedProduct: product({ price: 100, stock: 8 }) });

        await service.updateProductDetailsService(7, { price: 90, sku: "GPU-000007" } as never);

        expect(alerts.recordTransitionsInTransaction).toHaveBeenCalledWith(
            expect.anything(),
            [expect.objectContaining({
                type: "price_drop",
                previousPrice: 100,
                currentPrice: 90,
            })],
        );
    });

    it("does not emit an alert for equal effective price or unchanged stock", async () => {
        const equalPrice = buildService({ lockedProduct: product({ price: 100, stock: 8 }) });
        await equalPrice.service.updateProductDetailsService(7, { price: 100, sku: "GPU-000007" } as never);
        expect(equalPrice.alerts.recordTransitionsInTransaction).not.toHaveBeenCalled();

        const unchangedStock = buildService({ lockedProduct: product({ stock: 8 }) });
        await unchangedStock.service.updateInventoryService(7, 8);
        expect(unchangedStock.alerts.recordTransitionsInTransaction).not.toHaveBeenCalled();
    });
});
