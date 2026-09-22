import { describe, expect, it, vi } from "vitest";
import { NestProductsService } from "../products.service";
import type { ProductComparisonRow } from "../products.types";

const product = (overrides: Partial<ProductComparisonRow> = {}): ProductComparisonRow => ({
    id: 12,
    name: "Laptop A",
    category: "Laptops",
    categoryId: 3,
    brand: "Digital-E",
    sku: "LAPTOP-A",
    price: 20000000,
    stock: 0,
    attributes: {},
    ...overrides,
});

const createProductsService = (repository: { getProductsForComparison: ReturnType<typeof vi.fn> }) =>
    new NestProductsService(repository as never, undefined as never, undefined as never);

describe("NestProductsService.getProductsForComparison", () => {
    it("returns requested order and normalized category and attributes", async () => {
        const repository = {
            getProductsForComparison: vi.fn().mockResolvedValue([
                product({ id: 18, name: "Laptop B", attributes: { memory: { label: "Memory", type: "text", value: "16 GB" } } }),
                product({ attributes: [{ key: "screen_size", label: "Screen size", type: "number", value: 15.6, unit: "in" }] }),
            ]),
        };
        const service = createProductsService(repository);

        const comparison = await service.getProductsForComparison([12, 18]);
        expect(comparison).toMatchObject({
            category: { name: "Laptops" },
            products: [
                { id: 12, stock: 0, attributes: [{ key: "screen_size", value: "15.6" }] },
                { id: 18, attributes: [{ key: "memory", value: "16 GB" }] },
            ],
        });
        expect(comparison.products.every((item) => !Object.hasOwn(item, "categoryId"))).toBe(true);
        expect(repository.getProductsForComparison).toHaveBeenCalledOnce();
        expect(repository.getProductsForComparison).toHaveBeenCalledWith([12, 18]);
    });

    it("rejects missing products with their ids", async () => {
        const repository = { getProductsForComparison: vi.fn().mockResolvedValue([product()]) };
        const service = createProductsService(repository);

        await expect(service.getProductsForComparison([12, 18])).rejects.toMatchObject({
            code: "COMPARE_PRODUCTS_NOT_FOUND",
            statusCode: 404,
            details: { missingIds: [18] },
        });
    });

    it("rejects products from different categories", async () => {
        const repository = {
            getProductsForComparison: vi.fn().mockResolvedValue([
                product(),
                product({ id: 18, category: "Phones", categoryId: 4 }),
            ]),
        };
        const service = createProductsService(repository);

        await expect(service.getProductsForComparison([12, 18])).rejects.toMatchObject({
            code: "COMPARE_CATEGORY_MISMATCH",
            statusCode: 422,
        });
    });
});
