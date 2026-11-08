import { afterAll, describe, expect, it } from "vitest";
import { closeIntegrationPools, createTestProduct, integrationPool, integrationPrefix } from "../../database/__tests__/integration-database";
import { NestProductsRepository } from "../products.repository";

describe("catalog search integration", () => {
    const ids: number[] = [];

    afterAll(async () => {
        try {
            for (const id of ids) await integrationPool.execute("DELETE FROM products WHERE id = ?", [id]);
        } finally {
            await closeIntegrationPools();
        }
    });

    it("matches Vietnamese names and ranks compact SKU aliases before text while respecting categories", async () => {
        const model = `RTX${integrationPrefix.slice(3)}`;
        const exact = await createTestProduct("sku");
        ids.push(exact);
        const broader = await createTestProduct("text");
        ids.push(broader);
        await integrationPool.execute("UPDATE products SET name = ?, sku = ? WHERE id = ?", [`Độ phân giải ${integrationPrefix}`, model, exact]);
        await integrationPool.execute("UPDATE products SET name = ?, category_id = 9 WHERE id = ?", [`Adapter ${model}`, broader]);

        const repository = new NestProductsRepository();
        for (const term of [`Độ phân giải ${integrationPrefix}`, `do phan giai ${integrationPrefix}`]) {
            expect((await repository.searchProducts(term, 5)).map(({ id }) => id)).toEqual([exact]);
        }
        for (const term of [model, `RTX ${model.slice(3)}`]) {
            expect((await repository.searchProducts(term, 5)).map(({ id }) => id)).toEqual([exact, broader]);
            const filters = { term, categories: ["Graphics Card"] };
            expect((await repository.getProductsByFilters(filters, 1, 0)).map(({ id }) => id)).toEqual([broader]);
            expect(await repository.countProductsByFilters(filters)).toBe(1);
        }
    });
});
