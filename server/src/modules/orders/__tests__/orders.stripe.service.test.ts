import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../orders.service", () => {
    // orders.stripe.service.ts and this test file both consume this module
    // via an ESM default import (`import orderService from "../orders.service"`).
    // A mock factory's returned object needs an explicit `default` key for
    // Vitest to resolve that default import against — without it, Vitest
    // throws "No default export is defined on the mock". The top-level
    // spread is ALSO required, separately: orders.stripe.service.ts reads
    // these functions via a namespace import and property access directly
    // off the module's top level (`orderServiceModule.foo`), while this test
    // reads them off the default import (`orderService.foo` via `.default`)
    // — both access paths must resolve to the very same `vi.fn()` instances,
    // so removing the top-level spread would silently break the
    // implementation's mocking even though it looks redundant judging only
    // by how this test file itself uses the import.
    const mocked = {
        getPendingCheckoutBySessionId: vi.fn(),
        createOrderFromValidatedCart: vi.fn(),
        markPendingCheckoutConsumed: vi.fn(),
        insertPendingCheckout: vi.fn(),
        createCheckoutError: vi.fn(),
    };
    return { ...mocked, default: mocked };
});
vi.mock("#src/modules/cart/cart.service", () => {
    // Same default-export requirement as above — orders.stripe.service.ts
    // default-imports this module too, even though these tests don't
    // exercise createCheckoutSession (the only function that uses it). The
    // top-level spread is required for the same reason as above: the
    // implementation reads these functions off the namespace import's top
    // level, not off a `.default` property, so both access paths need to
    // share the same `vi.fn()` instances.
    const mocked = { validateCheckoutSubmission: vi.fn() };
    return { ...mocked, default: mocked };
});
vi.mock("#src/config/stripe.config", () => ({
    stripeClient: { checkout: { sessions: { create: vi.fn() } } },
}));
vi.mock("#src/shared/utils/logger", () => ({
    logger: { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() },
}));

import orderService from "../orders.service";
import stripeService from "../orders.stripe.service";
// This default-import-of-a-module.exports-object pattern matches the one
// already used in server/src/modules/inventory/__tests__/inventory.service.test.ts.

describe("handleCheckoutSessionCompleted", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("does not create a second order for an already-consumed session", async () => {
        (orderService.getPendingCheckoutBySessionId as ReturnType<typeof vi.fn>).mockResolvedValue({
            id: 1,
            stripe_session_id: "cs_test_123",
            user_id: "user-1",
            cart_json: "[]",
            total_price: "10.00",
            discount: "0.00",
            shipping_address: "123 Main St",
            created_at: "2026-07-07T00:00:00.000Z",
            consumed_at: "2026-07-07T00:01:00.000Z",
        });

        await stripeService.handleCheckoutSessionCompleted({ id: "cs_test_123", payment_intent: "pi_123" });

        expect(orderService.createOrderFromValidatedCart).not.toHaveBeenCalled();
        expect(orderService.markPendingCheckoutConsumed).not.toHaveBeenCalled();
    });

    it("creates the order and marks the session consumed on first delivery", async () => {
        (orderService.getPendingCheckoutBySessionId as ReturnType<typeof vi.fn>).mockResolvedValue({
            id: 2,
            stripe_session_id: "cs_test_456",
            user_id: "user-2",
            cart_json: JSON.stringify([{ product_id: 1, quantity: 2, price: 5, product_name: "Widget" }]),
            total_price: "10.00",
            discount: "1.00",
            shipping_address: "456 Side St",
            created_at: "2026-07-07T00:00:00.000Z",
            consumed_at: null,
        });

        await stripeService.handleCheckoutSessionCompleted({ id: "cs_test_456", payment_intent: { id: "pi_456" } });

        expect(orderService.createOrderFromValidatedCart).toHaveBeenCalledWith({
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
        expect(orderService.markPendingCheckoutConsumed).toHaveBeenCalledWith("cs_test_456");
    });

    it("does not mark the session consumed if order creation fails", async () => {
        (orderService.getPendingCheckoutBySessionId as ReturnType<typeof vi.fn>).mockResolvedValue({
            id: 3,
            stripe_session_id: "cs_test_789",
            user_id: "user-3",
            cart_json: JSON.stringify([{ product_id: 1, quantity: 1, price: 5, product_name: "Widget" }]),
            total_price: "5.00",
            discount: "0.00",
            shipping_address: "789 Third St",
            created_at: "2026-07-07T00:00:00.000Z",
            consumed_at: null,
        });
        (orderService.createOrderFromValidatedCart as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("db error"));

        await expect(
            stripeService.handleCheckoutSessionCompleted({ id: "cs_test_789", payment_intent: "pi_789" }),
        ).rejects.toThrow("db error");

        expect(orderService.markPendingCheckoutConsumed).not.toHaveBeenCalled();
    });
});
