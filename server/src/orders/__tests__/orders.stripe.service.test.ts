import { describe, it, expect, vi, beforeEach } from "vitest";
import { NestOrdersStripeService } from "../orders.stripe.service";
import type { NestCartService } from "../../cart/cart.service";
import type { NestOrdersService } from "../orders.service";

vi.mock("#src/config/stripe.config", () => ({
    stripeClient: { checkout: { sessions: { create: vi.fn() } } },
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
    } as unknown as NestOrdersService;
    return { service: new NestOrdersStripeService(cartService, ordersService), cartService, ordersService };
}

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

        await expect(
            service.handleCheckoutSessionCompleted({ id: "cs_test_789", payment_intent: "pi_789" }),
        ).rejects.toThrow("db error");

        expect(ordersService.markPendingCheckoutConsumed).not.toHaveBeenCalled();
    });
});
