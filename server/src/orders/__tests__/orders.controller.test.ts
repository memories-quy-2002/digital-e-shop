import { describe, it, expect, vi, beforeEach } from "vitest";
import { HttpException } from "@nestjs/common";
import { ROLES_KEY } from "../../guards/roles.guard";
import { OrdersController } from "../orders.controller";
import type { NestOrdersService } from "../orders.service";
import type { NestOrdersStripeService } from "../orders.stripe.service";

vi.mock("#src/config/stripe.config", () => ({
    stripeClient: { checkout: { sessions: { create: vi.fn() } } },
}));

vi.mock("#src/shared/utils/logger", () => ({
    logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

function buildController() {
    const ordersService = {} as unknown as NestOrdersService;
    const ordersStripeService = { createCheckoutSession: vi.fn() } as unknown as NestOrdersStripeService;
    return { controller: new OrdersController(ordersService, ordersStripeService), ordersService, ordersStripeService };
}

describe("OrdersController", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("marks migrated admin order endpoints as Admin-only", () => {
        expect(Reflect.getMetadata(ROLES_KEY, OrdersController.prototype.getOrders)).toEqual(["Admin"]);
        expect(Reflect.getMetadata(ROLES_KEY, OrdersController.prototype.getOrderItems)).toEqual(["Admin"]);
        expect(Reflect.getMetadata(ROLES_KEY, OrdersController.prototype.changeOrderStatus)).toEqual(["Admin"]);
    });

    it("hides internal errors when checkout session creation fails with a 500", async () => {
        const { controller, ordersStripeService } = buildController();
        vi.mocked(ordersStripeService.createCheckoutSession).mockRejectedValue(new Error("Stripe exploded"));

        const rejection = await controller
            .createCheckoutSession("user-1", {
                totalPrice: 10,
                cart: [{ productId: 1, quantity: 1, price: 10 }],
                discount: 0,
                shippingAddress: "123 Main St",
            })
            .catch((err) => err);

        expect(rejection).toBeInstanceOf(HttpException);
        expect(rejection.getStatus()).toBe(500);
        expect(rejection.getResponse()).toEqual({ msg: "Unable to start checkout right now" });
    });

    it("hides internal errors when loading an order by session id fails", async () => {
        const { controller, ordersService } = buildController();
        (ordersService as unknown as { getOrderByStripeSessionId: ReturnType<typeof vi.fn> }).getOrderByStripeSessionId =
            vi.fn().mockRejectedValue(new Error("database blew up"));

        const rejection = await controller.getOrderBySessionId("cs_test_123").catch((err) => err);

        expect(rejection).toBeInstanceOf(HttpException);
        expect(rejection.getStatus()).toBe(500);
        expect(rejection.getResponse()).toEqual({ msg: "Unable to retrieve order right now" });
    });
});
