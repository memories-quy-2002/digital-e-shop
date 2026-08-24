import { describe, it, expect, vi, beforeEach } from "vitest";
import { HttpException } from "@nestjs/common";
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
    const ordersService = {
        applyDiscount: vi.fn(),
        makePurchase: vi.fn(),
        getOrderDetail: vi.fn(),
        getOrderByStripeSessionId: vi.fn(),
    } as unknown as NestOrdersService;
    const ordersStripeService = { createCheckoutSession: vi.fn() } as unknown as NestOrdersStripeService;
    return { controller: new OrdersController(ordersService, ordersStripeService), ordersService, ordersStripeService };
}

const customerRequest = (id: string) => ({ user: { id, role: "customer" } }) as never;
const adminRequest = () => ({ user: { id: "admin-1", role: "admin" } }) as never;

describe("OrdersController", () => {
    beforeEach(() => {
        vi.clearAllMocks();
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
        vi.mocked(ordersService.getOrderByStripeSessionId).mockRejectedValue(new Error("database blew up"));

        const rejection = await controller
            .getOrderBySessionId("cs_test_123", customerRequest("user-1"))
            .catch((err) => err);

        expect(rejection).toBeInstanceOf(HttpException);
        expect(rejection.getStatus()).toBe(500);
        expect(rejection.getResponse()).toEqual({ msg: "Unable to retrieve order right now" });
    });

    it("does not expose another customer's order detail", async () => {
        const { controller, ordersService } = buildController();
        vi.mocked(ordersService.getOrderDetail).mockResolvedValue({
            id: 42,
            user_id: "owner-1",
            customer_email: "owner@example.com",
            items: [],
        } as never);

        const rejection = await controller
            .getOrderDetail("42", customerRequest("attacker-1"))
            .catch((err) => err);

        expect(rejection).toBeInstanceOf(HttpException);
        expect(rejection.getStatus()).toBe(404);
    });

    it("allows an admin to inspect any order", async () => {
        const { controller, ordersService } = buildController();
        vi.mocked(ordersService.getOrderDetail).mockResolvedValue({
            id: 42,
            user_id: "owner-1",
            items: [],
        } as never);

        const response = await controller.getOrderDetail("42", adminRequest());
        expect(response.order.id).toBe(42);
    });

    it("does not expose another customer's order by Stripe session id", async () => {
        const { controller, ordersService } = buildController();
        vi.mocked(ordersService.getOrderByStripeSessionId).mockResolvedValue({
            id: 42,
            user_id: "owner-1",
            date_added: "2026-08-24T00:00:00.000Z",
            payment_method: "card",
        } as never);

        const rejection = await controller
            .getOrderBySessionId("cs_other", customerRequest("attacker-1"))
            .catch((err) => err);

        expect(rejection).toBeInstanceOf(HttpException);
        expect(rejection.getStatus()).toBe(404);
    });

    it("recomputes cash checkout discount from the submitted coupon code", async () => {
        const { controller, ordersService } = buildController();
        vi.mocked(ordersService.applyDiscount).mockResolvedValue({
            id: 1,
            discount_code: "SAVE10",
            discount_percent: 10,
            min_order_value: 0,
        });
        vi.mocked(ordersService.makePurchase).mockResolvedValue({ id: 7, date_added: "2026-08-24T00:00:00.000Z" });

        await controller.makePurchase("user-1", {
            totalPrice: 100,
            cart: [{ productId: 1, quantity: 1, price: 100 }],
            discount: 99,
            discountCode: "SAVE10",
            shippingAddress: "123 Main St",
            paymentMethod: "cash",
        });

        expect(ordersService.applyDiscount).toHaveBeenCalledWith("SAVE10");
        expect(ordersService.makePurchase).toHaveBeenCalledWith(
            "user-1",
            expect.objectContaining({ discount: 10 }),
        );
    });
});
