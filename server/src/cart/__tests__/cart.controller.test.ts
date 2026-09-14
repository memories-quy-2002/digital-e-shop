import { describe, expect, it, vi } from "vitest";
import { GUARDS_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { CartController } from "../cart.controller";

vi.mock("#src/config/database.config", () => ({ default: { query: vi.fn() } }));
vi.mock("../../products/products.repository", () => ({ NestProductsRepository: class NestProductsRepository {} }));

describe("CartController guest preview", () => {
    it("is public and delegates the validated preview request without changing the response contract", async () => {
        const previewGuestCart = vi.fn().mockResolvedValue({
            valid: true,
            cartItems: [],
            issues: [],
            merchandiseTotal: 80,
            promotion: { code: null, valid: true, discount: 0, discountPercent: null },
            totalPrice: 80,
        });
        const controller = new CartController({ previewGuestCart } as never);

        const result = await controller.previewGuestCart({ items: [{ productId: 10, quantity: 1 }] });

        expect(Reflect.getMetadata(PATH_METADATA, CartController.prototype.previewGuestCart)).toBe("guest/preview");
        expect(Reflect.getMetadata(GUARDS_METADATA, CartController.prototype.previewGuestCart)).toBeUndefined();
        expect(previewGuestCart).toHaveBeenCalledWith([{ productId: 10, quantity: 1 }], undefined);
        expect(result).toMatchObject({ msg: "Guest cart preview retrieved successfully", totalPrice: 80 });
    });

    it("creates a secure anonymous cart cookie when syncing guest items", async () => {
        const syncGuestCart = vi.fn().mockResolvedValue([{ productId: 10, quantity: 2 }]);
        const controller = new CartController({ syncGuestCart } as never);
        const request = { cookies: {} } as never;
        const response = { cookie: vi.fn() } as never;

        await expect(controller.syncGuestCart(request, response, { items: [{ productId: 10, quantity: 2 }] })).resolves.toMatchObject({
            items: [{ productId: 10, quantity: 2 }],
        });

        expect(syncGuestCart).toHaveBeenCalledWith(expect.stringMatching(/^[0-9a-f-]{36}$/i), [{ productId: 10, quantity: 2 }]);
        expect(response.cookie).toHaveBeenCalledWith(
            "digitalEGuestCartId",
            expect.stringMatching(/^[0-9a-f-]{36}$/i),
            expect.objectContaining({ httpOnly: true, path: "/", maxAge: 30 * 24 * 60 * 60 * 1000 }),
        );
    });

    it("clears the anonymous cookie after a guest cart converts into an order", async () => {
        const clearGuestCart = vi.fn().mockResolvedValue(undefined);
        const controller = new CartController({ clearGuestCart } as never);
        const request = { cookies: { digitalEGuestCartId: "2f1c3c6d-1a0b-4f4a-9e1e-2e8a2dbf4b68" } } as never;
        const response = { clearCookie: vi.fn() } as never;

        await controller.clearGuestCart(request, response, { converted: true });

        expect(clearGuestCart).toHaveBeenCalledWith("2f1c3c6d-1a0b-4f4a-9e1e-2e8a2dbf4b68", true);
        expect(response.clearCookie).toHaveBeenCalledWith("digitalEGuestCartId", expect.objectContaining({ path: "/" }));
    });
});
