import { describe, it, expect, vi, beforeEach } from "vitest";
import { stripeClient } from "#src/config/stripe.config";
import { NestOrdersStripeService } from "../orders.stripe.service";
import type { NestCartService } from "../../cart/cart.service";
import type { NestOrdersService } from "../orders.service";

vi.mock("#src/config/stripe.config", () => ({
    stripeClient: { checkout: { sessions: { create: vi.fn(), expire: vi.fn() } } },
}));
vi.mock("#src/shared/utils/logger", () => ({
    logger: { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() },
}));

function buildService() {
    const cartService = { validateCheckoutSubmission: vi.fn() } as unknown as NestCartService;
    const ordersService = {
        getPendingCheckoutBySessionId: vi.fn(),
        createOrderFromValidatedCart: vi.fn(),
        markPendingCheckoutConsumed: vi.fn(),
        insertPendingCheckout: vi.fn(),
        applyDiscount: vi.fn(),
        getOrderByStripeSessionId: vi.fn(),
    } as unknown as NestOrdersService;
    return { service: new NestOrdersStripeService(cartService, ordersService), cartService, ordersService };
}

describe("createCheckoutSession", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("uses a server-calculated coupon discount instead of a client-supplied amount", async () => {
        const { service, cartService, ordersService } = buildService();
        vi.mocked(cartService.validateCheckoutSubmission).mockResolvedValue({
            cartItems: [{ product_id: 1, quantity: 1, price: 100, product_name: "Widget" }],
            authoritativeTotalPrice: 100,
            issues: [],
            mismatches: [],
        } as never);
        vi.mocked(ordersService.applyDiscount).mockResolvedValue({
            id: 1,
            discount_code: "SAVE10",
            discount_percent: 10,
            active: 1,
            min_order_value: 0,
        });
        vi.mocked(stripeClient.checkout.sessions.create).mockResolvedValue({
            id: "cs_secure_discount",
            url: "https://checkout.stripe.test/session",
        } as never);

        await service.createCheckoutSession("user-1", {
            totalPrice: 100,
            cart: [{ productId: 1, quantity: 1, price: 100 }],
            discount: 99,
            discountCode: "SAVE10",
            shippingAddress: "123 Main St",
        } as never);

        expect(ordersService.applyDiscount).toHaveBeenCalledWith("SAVE10");
        expect(stripeClient.checkout.sessions.create).toHaveBeenCalledWith(
            expect.objectContaining({
                line_items: [
                    expect.objectContaining({
                        price_data: expect.objectContaining({ unit_amount: 9000 }),
                    }),
                ],
            }),
        );
        expect(ordersService.insertPendingCheckout).toHaveBeenCalledWith(
            expect.objectContaining({
                totalPrice: 100,
                discount: 10,
            }),
        );
    });
});

describe("handleCheckoutSessionCompleted", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("does not create a second order for an already-consumed session", async () => {
        const { service, ordersService } = buildService();
        vi.mocked(ordersService.getPendingCheckoutBySessionId).mockResolvedValue({
            id: 1,
            stripe_session_id: "cs_test_123",
            user_id: "user-1",
            cart_json: "[]",
            total_price: "10.00",
            discount: "0.00",
            shipping_address: "123 Main St",
            created_at: "2026-07-07T00:00:00.000Z",
            consumed_at: "2026-07-07T00:01:00.000Z",
        } as never);

        await service.handleCheckoutSessionCompleted({ id: "cs_test_123", payment_intent: "pi_123" });

        expect(ordersService.createOrderFromValidatedCart).not.toHaveBeenCalled();
        expect(ordersService.markPendingCheckoutConsumed).not.toHaveBeenCalled();
    });

    it("creates the order and marks the session consumed on first delivery", async () => {
        const { service, ordersService } = buildService();
        vi.mocked(ordersService.getPendingCheckoutBySessionId).mockResolvedValue({
            id: 2,
            stripe_session_id: "cs_test_456",
            user_id: "user-2",
            cart_json: JSON.stringify([{ product_id: 1, quantity: 2, price: 5, product_name: "Widget" }]),
            total_price: "10.00",
            discount: "1.00",
            shipping_address: "456 Side St",
            created_at: "2026-07-07T00:00:00.000Z",
            consumed_at: null,
        } as never);

        await service.handleCheckoutSessionCompleted({ id: "cs_test_456", payment_intent: { id: "pi_456" } });

        expect(ordersService.createOrderFromValidatedCart).toHaveBeenCalledWith({
            uid: "user-2",
            authoritativeCart: [{ product_id: 1, quantity: 2, price: 5, product_name: "Widget" }],
            authoritativeTotalPrice: 10,
            discount: 1,
            shippingAddress: "456 Side St",
            paymentMethod: "card",
            allowOversell: true,
            stripeCheckoutSessionId: "cs_test_456",
            stripePaymentIntentId: "pi_456",
        });
        expect(ordersService.markPendingCheckoutConsumed).toHaveBeenCalledWith("cs_test_456");
    });

    it("treats a duplicate Stripe session order as already processed", async () => {
        const { service, ordersService } = buildService();
        vi.mocked(ordersService.getPendingCheckoutBySessionId).mockResolvedValue({
            id: 4,
            stripe_session_id: "cs_duplicate",
            user_id: "user-4",
            cart_json: "[]",
            total_price: "10.00",
            discount: "0.00",
            shipping_address: "123 Main St",
            created_at: "2026-07-07T00:00:00.000Z",
            consumed_at: null,
        } as never);
        vi.mocked(ordersService.createOrderFromValidatedCart).mockRejectedValue(
            Object.assign(new Error("Duplicate entry"), { code: "ER_DUP_ENTRY" }),
        );
        vi.mocked(ordersService.getOrderByStripeSessionId).mockResolvedValue({
            id: 99,
            user_id: "user-4",
            date_added: "2026-07-07T00:00:00.000Z",
            payment_method: "card",
        } as never);

        await expect(
            service.handleCheckoutSessionCompleted({ id: "cs_duplicate", payment_intent: "pi_duplicate" }),
        ).resolves.toBeUndefined();

        expect(ordersService.markPendingCheckoutConsumed).toHaveBeenCalledWith("cs_duplicate");
    });

    it("does not mark the session consumed if order creation fails", async () => {
        const { service, ordersService } = buildService();
        vi.mocked(ordersService.getPendingCheckoutBySessionId).mockResolvedValue({
            id: 3,
            stripe_session_id: "cs_test_789",
            user_id: "user-3",
            cart_json: JSON.stringify([{ product_id: 1, quantity: 1, price: 5, product_name: "Widget" }]),
            total_price: "5.00",
            discount: "0.00",
            shipping_address: "789 Third St",
            created_at: "2026-07-07T00:00:00.000Z",
            consumed_at: null,
        } as never);
        vi.mocked(ordersService.createOrderFromValidatedCart).mockRejectedValue(new Error("db error"));
        vi.mocked(ordersService.getOrderByStripeSessionId).mockResolvedValue(null);

        await expect(
            service.handleCheckoutSessionCompleted({ id: "cs_test_789", payment_intent: "pi_789" }),
        ).rejects.toThrow("db error");

        expect(ordersService.markPendingCheckoutConsumed).not.toHaveBeenCalled();
    });
});
