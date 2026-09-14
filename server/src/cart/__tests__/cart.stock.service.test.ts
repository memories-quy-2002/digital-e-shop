import { describe, expect, it, vi } from "vitest";
import { CartStockConflictError, NestCartService } from "../cart.service";

describe("customer cart stock validation", () => {
    it("checks the existing customer-cart quantity before adding more units", async () => {
        const addItemToCartByUserId = vi.fn();
        const service = new NestCartService(
            { getCartItemQuantityByUserId: vi.fn((_uid, _pid, callback) => callback(null, [{ quantity: 5 }])), addItemToCartByUserId } as never,
            {} as never,
            { getProductById: vi.fn().mockResolvedValue({ id: 10, name: "Widget", stock: 6, available_stock: 6 }) } as never,
            {} as never,
        );

        await expect(service.addItemToCart(10, "user-1", 2)).rejects.toMatchObject<Partial<CartStockConflictError>>({
            statusCode: 409,
            message: "Widget has only 6 item(s) available. Requested 2; your cart already contains 5, so you can add at most 1 more.",
        });
        expect(addItemToCartByUserId).not.toHaveBeenCalled();
    });
});
