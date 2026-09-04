import { describe, expect, it, vi } from "vitest";
import { OrdersController } from "./orders.controller";
import type { NestOrdersService } from "./orders.service";
import type { NestOrdersStripeService } from "./orders.stripe.service";

function buildController() {
    const ordersService = {
        applyDiscount: vi.fn(),
        makePurchase: vi.fn(),
    } as unknown as NestOrdersService;
    const ordersStripeService = {} as unknown as NestOrdersStripeService;
    return { controller: new OrdersController(ordersService, ordersStripeService), ordersService };
}

describe("customer checkout flow", () => {
    it("rejects an empty cart before touching the order service", async () => {
        const { controller, ordersService } = buildController();

        const rejection = await controller.makePurchase("customer-1", {
            totalPrice: 0,
            cart: [],
            discount: 0,
            shippingAddress: "1 Demo Street",
            paymentMethod: "cash",
        }).catch((error) => error);

        expect(rejection.getStatus()).toBe(400);
        expect(ordersService.makePurchase).not.toHaveBeenCalled();
    });

    it("recomputes the discount from the validated promotion instead of trusting the submitted amount", async () => {
        const { controller, ordersService } = buildController();
        vi.mocked(ordersService.applyDiscount).mockResolvedValue({
            id: 1,
            discount_code: "SAVE10",
            discount_percent: 10,
            min_order_value: 0,
        } as never);
        vi.mocked(ordersService.makePurchase).mockResolvedValue({
            id: 99,
            date_added: "2026-09-04T00:00:00.000Z",
        } as never);

        await controller.makePurchase("customer-1", {
            totalPrice: 100,
            cart: [{ productId: 1, quantity: 1, price: 100 }],
            discount: 100,
            discountCode: "SAVE10",
            shippingAddress: "1 Demo Street",
            paymentMethod: "cash",
        });

        expect(ordersService.makePurchase).toHaveBeenCalledWith(
            "customer-1",
            expect.objectContaining({ discount: 10 }),
        );
    });
});
