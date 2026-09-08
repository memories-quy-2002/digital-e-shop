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
});
