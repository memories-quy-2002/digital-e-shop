import { describe, expect, it, vi } from "vitest";
import { HttpException } from "@nestjs/common";
import { ProductsController } from "../products.controller";

const createController = (service: { getProductsForComparison: ReturnType<typeof vi.fn> }) =>
    new ProductsController(service as never, undefined as never);

describe("ProductsController.compareProducts", () => {
    it("returns the comparison response for valid ids", async () => {
        const comparison = { category: { name: "Laptops" }, products: [{ id: 12 }, { id: 18 }] };
        const service = { getProductsForComparison: vi.fn().mockResolvedValue(comparison) };
        const controller = createController(service);

        await expect(controller.compareProducts("18,12")).resolves.toEqual({
            comparison,
            msg: "Products ready for comparison",
        });
        expect(service.getProductsForComparison).toHaveBeenCalledWith([18, 12]);
    });

    it("maps parser errors to an HttpException response", async () => {
        const service = { getProductsForComparison: vi.fn() };
        const controller = createController(service);

        await expect(controller.compareProducts("12,12")).rejects.toEqual(
            expect.objectContaining({
                response: {
                    code: "COMPARE_INVALID_IDS",
                    msg: "Two to four valid products are required.",
                },
                status: 400,
            } satisfies Partial<HttpException>),
        );
        expect(service.getProductsForComparison).not.toHaveBeenCalled();
    });
});
