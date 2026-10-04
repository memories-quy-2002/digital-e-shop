import { beforeEach, describe, expect, it, vi } from "vitest";

const { pool } = vi.hoisted(() => {
    process.env.DATABASE_URL ??= "mysql://unit-test:unit-test@127.0.0.1:3307/unit_test";
    return { pool: { query: vi.fn() } };
});

vi.mock("#src/config/database.config", () => ({ default: pool }));
vi.mock("#src/database/prisma/client", () => ({
    product: { findMany: vi.fn(), findUnique: vi.fn(), count: vi.fn() },
    $queryRawUnsafe: vi.fn(),
}));

import { NestProductsRepository } from "../products.repository";
import type { TransactionContext } from "../../database/transaction";

describe("transactional product persistence methods", () => {
    beforeEach(() => pool.query.mockReset());

    it("resolves or creates named IDs through the supplied transaction", async () => {
        const tx = { query: vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce({ insertId: 12 }) };
        const repository = new NestProductsRepository();

        await expect(repository.ensureNamedIdInTransaction(tx as unknown as TransactionContext, "brands", "Acme"))
            .resolves.toBe(12);
        expect(tx.query).toHaveBeenNthCalledWith(1, "SELECT id FROM brands WHERE name = ?", ["Acme"]);
        expect(tx.query).toHaveBeenNthCalledWith(2, "INSERT INTO brands (name) VALUES (?)", ["Acme"]);
        expect(pool.query).not.toHaveBeenCalled();
    });

    it("inserts products on the supplied transaction and returns its insert ID", async () => {
        const tx = { query: vi.fn().mockResolvedValue({ insertId: 41 }) };
        const record = {
            name: "GPU", description: "", fileName: "gpu", categoryId: 2, brandId: 3,
            specifications: "", sku: "GPU-41", manufacturerPartNumber: null,
            warrantyMonths: null, price: 100, inventory: 4,
        };

        await expect(new NestProductsRepository().insertProductInTransaction(tx as unknown as TransactionContext, record))
            .resolves.toEqual({ insertId: 41 });
        expect(tx.query).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO products"), [
            "GPU", "", "gpu", 2, 3, "", "GPU-41", null, null, 100, 4,
        ]);
        expect(pool.query).not.toHaveBeenCalled();
    });

    it("returns null when a product row lock finds no active product", async () => {
        const tx = { query: vi.fn().mockResolvedValue([]) };

        await expect(new NestProductsRepository().getProductMutationStateForUpdate(tx as unknown as TransactionContext, 41))
            .resolves.toBeNull();
        expect(tx.query).toHaveBeenCalledWith(
            "SELECT price, sale_price, stock FROM products WHERE id = ? AND stock >= 0 FOR UPDATE",
            [41],
        );
        expect(pool.query).not.toHaveBeenCalled();
    });

    it("updates product fields through the transaction and returns affectedRows", async () => {
        const tx = { query: vi.fn().mockResolvedValue({ affectedRows: 1 }) };
        const record = {
            name: "GPU", description: "updated", categoryId: 2, brandId: 3, specifications: "spec",
            sku: "GPU-41", manufacturerPartNumber: null, warrantyMonths: 24, price: 100,
            salePrice: 0, stock: 0,
        };

        await expect(new NestProductsRepository().updateProductInTransaction(tx as unknown as TransactionContext, 41, record))
            .resolves.toEqual({ affectedRows: 1 });
        expect(tx.query).toHaveBeenCalledWith(expect.stringContaining("UPDATE products"), [
            "GPU", "updated", 2, 3, "spec", "GPU-41", null, 24, 100, 0, 0, 41,
        ]);
        expect(pool.query).not.toHaveBeenCalled();
    });

    it("propagates transaction query errors without using the pool", async () => {
        const databaseError = new Error("transaction query failed");
        const tx = { query: vi.fn().mockRejectedValue(databaseError) };

        await expect(new NestProductsRepository().getProductMutationStateForUpdate(tx as unknown as TransactionContext, 41))
            .rejects.toBe(databaseError);
        expect(pool.query).not.toHaveBeenCalled();
    });
});

describe("filtered product count queries", () => {
    beforeEach(() => pool.query.mockReset().mockImplementation((_sql: unknown, _params: unknown, callback?: (error: null, rows: unknown[]) => void) => {
        if (callback) callback(null, [{ total: 4 }]);
        else return Promise.resolve([{ total: 4 }]);
    }));

    it.each([
        [{ term: " gpu ", categories: ["Video"], brands: ["Acme"], minPrice: 10, maxPrice: 100 },
            ["%gpu%", "%gpu%", "%gpu%", "%gpu%", "Video", "Acme", 10, 100]],
        [{ attributeFilters: [{ key: "socket", textValues: ["AM5", "LGA1700"] }] }, ["socket", "AM5", "LGA1700"]],
        [{ attributeFilters: [{ key: "memory", min: 8, max: 32 }] }, ["memory", 8, 32]],
        [{ attributeFilters: [{ key: "memory", min: 8 }] }, ["memory", 8]],
    ] as const)("counts each identity once with unchanged filters and parameters", async (filters, expectedParams) => {
        const repository = new NestProductsRepository();
        await expect(repository.countProductsByFilters(filters)).resolves.toBe(4);
        const countSql = String(pool.query.mock.calls[0][0]);
        expect(pool.query.mock.calls[0][1]).toEqual(expectedParams);
        expect(countSql).toContain("JOIN categories ON categories.id = products.category_id");
        expect(countSql).toContain("JOIN brands ON brands.id = products.brand_id");
        expect(countSql).toContain("products.stock >= 0");
        if (filters.attributeFilters?.length) expect(countSql).toContain("EXISTS (");
        expect(countSql).not.toContain("FROM reviews");
        expect(countSql).not.toContain("inventory_reservations");
    });

    it("keeps projection joins in listing and uses the same predicate and parameters in count", async () => {
        const repository = new NestProductsRepository();
        const filters = { term: "gpu", categories: ["Video"], attributeFilters: [{ key: "memory", min: 8, max: 32 }] };
        await repository.getProductsByFilters(filters, 12, 24);
        const listing = String(pool.query.mock.calls[0][0]);
        const listingParams = pool.query.mock.calls[0][1];
        await repository.countProductsByFilters(filters);
        const count = String(pool.query.mock.calls[1][0]);
        expect(listing).toContain("FROM reviews");
        expect(listing).toContain("inventory_reservations");
        expect(pool.query.mock.calls[1][1]).toContain("memory");
        expect(count).not.toContain("FROM reviews");
        expect(count).not.toContain("inventory_reservations");
        expect(pool.query.mock.calls[1][1]).toEqual(listingParams.slice(0, pool.query.mock.calls[1][1].length));
        const countFilters = count.indexOf("WHERE products.stock");
        const listingFilters = listing.indexOf("WHERE products.stock");
        expect(count.slice(countFilters).trim()).toEqual(listing.slice(listingFilters, listing.indexOf("ORDER BY", listingFilters)).trim());
    });

    it("propagates count query failures", async () => {
        const failure = new Error("count failed");
        pool.query.mockImplementationOnce((_sql: unknown, _params: unknown, callback: (error: Error) => void) => callback(failure));
        await expect(new NestProductsRepository().countProductsByFilters({})).rejects.toBe(failure);
    });
});
