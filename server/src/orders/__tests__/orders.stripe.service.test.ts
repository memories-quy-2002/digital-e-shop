import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../cart/cart.service", () => ({ NestCartService: class {} }));
vi.mock("../../stripe/stripe.service", () => ({ StripeService: class {} }));
vi.mock("../checkout-reservation.service", () => ({ CheckoutReservationService: class {} }));
vi.mock("#src/config/env.config", () => ({
    env: {
        clientUrl: "http://localhost:5173",
        paymentProviderMode: "live",
    },
}));
vi.mock("../orders.service", () => ({
    NestOrdersService: class {},
    createCheckoutError: (message: string, statusCode = 409, details = {}) => Object.assign(new Error(message), { statusCode, details }),
}));

import { NestOrdersStripeService } from "../orders.stripe.service";
import type { NestCartService } from "../../cart/cart.service";
import type { NestOrdersService } from "../orders.service";
import type { StripeService } from "../../stripe/stripe.service";
import type { CheckoutReservationService } from "../checkout-reservation.service";
import { env } from "#src/config/env.config";

vi.mock("#src/shared/utils/logger", () => ({
    logger: { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() },
}));

function buildService() {
    const cartService = { validateCheckoutSubmission: vi.fn() } as unknown as NestCartService;
    const ordersService = {
        finalizeReservedCheckout: vi.fn(),
        applyDiscount: vi.fn(),
        markPendingCheckoutExpired: vi.fn(),
    } as unknown as NestOrdersService;
    const stripeService = {
        createCheckoutSession: vi.fn(),
        expireCheckoutSession: vi.fn(),
    } as unknown as StripeService;
    const checkoutReservationService = {
        reserveInventory: vi.fn(),
        attachStripeSession: vi.fn().mockResolvedValue(undefined),
        releaseReservation: vi.fn().mockResolvedValue(undefined),
    } as unknown as CheckoutReservationService;

    return {
        service: new NestOrdersStripeService(cartService, ordersService, stripeService, checkoutReservationService),
        cartService,
        ordersService,
        stripeService,
        checkoutReservationService,
    };
}

const reservation = {
    pendingCheckoutId: 7,
    reservationToken: "reservation-token",
    expiresAt: new Date("2026-09-06T01:30:00.000Z"),
    cartSnapshot: [{ product_id: 1, quantity: 1, price: 100, product_name: "Widget" }],
    pricingSnapshot: { totalPrice: 100, discount: 10 },
    shippingAddress: "123 Main St",
    items: [{ productId: 1, quantity: 1 }],
};

describe("createCheckoutSession", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        env.paymentProviderMode = "live";
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-09-06T01:00:00.000Z"));
    });

    afterEach(() => vi.useRealTimers());

    it("reserves stock before Stripe and binds the reservation to a 30-minute session", async () => {
        const { service, cartService, ordersService, stripeService, checkoutReservationService } = buildService();
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
        vi.mocked(checkoutReservationService.reserveInventory).mockResolvedValue(reservation);
        vi.mocked(stripeService.createCheckoutSession).mockResolvedValue({
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

        expect(checkoutReservationService.reserveInventory).toHaveBeenCalledWith(expect.objectContaining({
            uid: "user-1",
            discount: 10,
            databaseExpiresAt: new Date("2026-09-06T01:35:00.000Z"),
        }));
        expect(stripeService.createCheckoutSession).toHaveBeenCalledWith(expect.objectContaining({
            expires_at: Math.floor(new Date("2026-09-06T01:00:00.000Z").getTime() / 1000) + 1800,
            client_reference_id: "reservation-token",
            metadata: { uid: "user-1", reservationToken: "reservation-token" },
        }));
        expect(checkoutReservationService.attachStripeSession).toHaveBeenCalledWith("reservation-token", "cs_secure_discount");
    });

    it("releases the reservation when Stripe session creation fails", async () => {
        const { service, cartService, stripeService, checkoutReservationService } = buildService();
        vi.mocked(cartService.validateCheckoutSubmission).mockResolvedValue({
            cartItems: [{ product_id: 1, quantity: 1, price: 10 }],
            authoritativeTotalPrice: 10,
            issues: [],
            mismatches: [],
        } as never);
        vi.mocked(checkoutReservationService.reserveInventory).mockResolvedValue({
            ...reservation,
            pricingSnapshot: { totalPrice: 10, discount: 0 },
        });
        vi.mocked(stripeService.createCheckoutSession).mockRejectedValue(new Error("stripe down"));

        await expect(service.createCheckoutSession("user-1", {
            totalPrice: 10,
            cart: [{ productId: 1, quantity: 1, price: 10 }],
            shippingAddress: "123 Main St",
        } as never)).rejects.toThrow("stripe down");
        expect(checkoutReservationService.releaseReservation).toHaveBeenCalledWith("reservation-token", "stripe_session_create_failed");
    });

    it("finalizes a symbolic Stripe checkout locally in mock mode", async () => {
        const { service, cartService, ordersService, stripeService, checkoutReservationService } = buildService();
        env.paymentProviderMode = "mock";
        vi.mocked(cartService.validateCheckoutSubmission).mockResolvedValue({
            cartItems: [{ product_id: 1, quantity: 1, price: 100, product_name: "Widget" }],
            authoritativeTotalPrice: 100,
            issues: [],
            mismatches: [],
        } as never);
        vi.mocked(checkoutReservationService.reserveInventory).mockResolvedValue(reservation);
        vi.mocked(ordersService.finalizeReservedCheckout).mockResolvedValue({
            id: 12,
            date_added: "2026-09-06T01:00:00.000Z",
        });

        await expect(service.createCheckoutSession("user-1", {
            totalPrice: 100,
            cart: [{ productId: 1, quantity: 1, price: 100 }],
            shippingAddress: "123 Main St",
        } as never)).resolves.toEqual({
            url: "http://localhost:5173/checkout-success?session_id=mock_stripe_reservation-token",
        });

        expect(stripeService.createCheckoutSession).not.toHaveBeenCalled();
        expect(checkoutReservationService.attachStripeSession).toHaveBeenCalledWith(
            "reservation-token",
            "mock_stripe_reservation-token",
        );
        expect(ordersService.finalizeReservedCheckout).toHaveBeenCalledWith(
            "mock_stripe_reservation-token",
            "mock_pi_reservation-token",
        );
    });
});

describe("Stripe checkout webhooks", () => {
    it("finalizes the reservation atomically and does not use the legacy oversell path", async () => {
        const { service, ordersService } = buildService();
        vi.mocked(ordersService.finalizeReservedCheckout).mockResolvedValue({ id: 12, date_added: "2026-09-06T01:00:00.000Z" });

        await service.handleCheckoutSessionCompleted({ id: "cs_test_456", payment_intent: { id: "pi_456" } });

        expect(ordersService.finalizeReservedCheckout).toHaveBeenCalledWith("cs_test_456", "pi_456");
    });

    it("marks a Stripe-expired session's reservation as expired", async () => {
        const { service, ordersService } = buildService();

        await service.handleCheckoutSessionExpired({ id: "cs_expired" });

        expect(ordersService.markPendingCheckoutExpired).toHaveBeenCalledWith("cs_expired");
    });
});
