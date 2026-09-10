import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("#src/config/env.config", () => ({
    env: {
        clientUrl: "http://localhost:5173",
        paymentProviderMode: "live",
        payosUsdToVndRate: 25_000,
    },
}));
vi.mock("#src/shared/utils/logger", () => ({
    logger: { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() },
}));
vi.mock("../../cart/cart.service", () => ({ NestCartService: class {} }));
vi.mock("../../payments/payos.service", () => ({ PayOSService: class {} }));
vi.mock("../orders.service", () => ({
    NestOrdersService: class {},
    createCheckoutError: (message: string, statusCode = 409, details = {}) => Object.assign(new Error(message), { statusCode, details }),
}));
vi.mock("../checkout-reservation.service", () => ({ CheckoutReservationService: class {} }));

import { env } from "#src/config/env.config";
import { NestOrdersPayOSService } from "../orders.payos.service";

const reservation = {
    pendingCheckoutId: 7,
    reservationToken: "reservation-token",
    expiresAt: new Date("2026-09-10T01:35:00.000Z"),
    cartSnapshot: [{ product_id: 1, quantity: 1, price: 100, product_name: "Widget" }],
    pricingSnapshot: { totalPrice: 100, discount: 10 },
    shippingAddress: "123 Main St",
    items: [{ productId: 1, quantity: 1 }],
};

function buildService() {
    const cartService = { validateCheckoutSubmission: vi.fn(), previewGuestCart: vi.fn() };
    const ordersService = {
        applyDiscount: vi.fn(),
        finalizePayOSCheckout: vi.fn(),
    };
    const payosService = { createPaymentLink: vi.fn(), cancelPaymentLink: vi.fn() };
    const checkoutReservationService = {
        reserveInventory: vi.fn(),
        attachPaymentProvider: vi.fn().mockResolvedValue(undefined),
        releaseReservation: vi.fn().mockResolvedValue(undefined),
        expirePayOSOrder: vi.fn(),
    };

    return {
        service: new NestOrdersPayOSService(cartService as never, ordersService as never, payosService as never, checkoutReservationService as never),
        cartService,
        ordersService,
        payosService,
        checkoutReservationService,
    };
}

describe("NestOrdersPayOSService", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        env.paymentProviderMode = "live";
        env.payosUsdToVndRate = 25_000;
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-09-10T01:00:00.000Z"));
    });

    afterEach(() => vi.useRealTimers());

    it("creates an authenticated PayOS link from an authoritative VND quote", async () => {
        const { service, cartService, ordersService, checkoutReservationService, payosService } = buildService();
        cartService.validateCheckoutSubmission.mockResolvedValue({
            cartItems: [{ product_id: 1, quantity: 1, price: 100, product_name: "Widget" }],
            authoritativeTotalPrice: 100,
            issues: [],
            mismatches: [],
        });
        const promotion = { id: 1, discount_code: "SAVE10", discount_percent: 10, active: 1, min_order_value: 0 };
        ordersService.applyDiscount.mockResolvedValue(promotion);
        checkoutReservationService.reserveInventory.mockResolvedValue(reservation);
        payosService.createPaymentLink.mockResolvedValue({
            orderCode: 1_789_002_000_000_007,
            amount: 2_250_000,
            currency: "VND",
            paymentLinkId: "link-123",
            checkoutUrl: "https://pay.payos.vn/web/link-123",
            status: "PENDING",
        });

        const result = await service.createCheckoutSession("user-1", {
            totalPrice: 100,
            cart: [{ productId: 1, quantity: 1, price: 100 }],
            discountCode: "SAVE10",
            shippingAddress: "123 Main St",
        });

        expect(result).toEqual(expect.objectContaining({
            url: "https://pay.payos.vn/web/link-123",
            amount: 2_250_000,
            currency: "VND",
        }));
        expect(payosService.createPaymentLink).toHaveBeenCalledWith(expect.objectContaining({
            amount: 2_250_000,
            returnUrl: expect.stringContaining("payos_order_code="),
        }));
    });

    it("creates the guest link, stores only a server-side provider reference, and returns the guest token once", async () => {
        const { service, cartService, checkoutReservationService, payosService } = buildService();
        cartService.previewGuestCart.mockResolvedValue({
            cartItems: [{ product_id: 1, quantity: 1, price: 100, product_name: "Widget" }],
            merchandiseTotal: 100,
            issues: [],
            promotion: { valid: true, discount: 10 },
        });
        checkoutReservationService.reserveInventory.mockResolvedValue(reservation);
        payosService.createPaymentLink.mockResolvedValue({
            orderCode: 1_789_002_000_000_007,
            amount: 2_250_000,
            currency: "VND",
            paymentLinkId: "link-123",
            checkoutUrl: "https://pay.payos.vn/web/link-123",
            status: "PENDING",
        });

        const result = await service.createGuestCheckoutSession({
            cart: [{ productId: 1, quantity: 1 }],
            contact: { email: "buyer@example.com", name: "Buyer Name", phone: "+84123456789" },
            shipping: { address: "123 Main St", city: "HCMC", country: "VN" },
            paymentMethod: "payos",
        });

        expect(result).toEqual(expect.objectContaining({
            url: "https://pay.payos.vn/web/link-123",
            paymentLinkId: "link-123",
            amount: 2_250_000,
            currency: "VND",
            guestOrderToken: expect.any(String),
        }));
        expect(checkoutReservationService.attachPaymentProvider).toHaveBeenCalledWith("reservation-token", expect.objectContaining({
            provider: "payos",
            providerReference: "link-123",
            providerOrderCode: result.orderCode,
            paymentAmount: 2_250_000,
            paymentCurrency: "VND",
            paymentFxRate: 25_000,
        }));
        const request = payosService.createPaymentLink.mock.calls[0][0];
        expect(JSON.stringify(request)).not.toContain("buyer@example.com");
        expect(JSON.stringify(request)).not.toContain(result.guestOrderToken);
        expect(JSON.stringify(request)).not.toContain("reservation-token");
    });

    it("releases the reservation when PayOS link creation fails", async () => {
        const { service, cartService, checkoutReservationService, payosService } = buildService();
        cartService.validateCheckoutSubmission.mockResolvedValue({
            cartItems: [{ product_id: 1, quantity: 1, price: 10 }],
            authoritativeTotalPrice: 10,
            issues: [],
            mismatches: [],
        });
        checkoutReservationService.reserveInventory.mockResolvedValue({ ...reservation, pricingSnapshot: { totalPrice: 10, discount: 0 } });
        payosService.createPaymentLink.mockRejectedValue(new Error("PayOS unavailable"));

        await expect(service.createCheckoutSession("user-1", {
            totalPrice: 10,
            cart: [{ productId: 1, quantity: 1, price: 10 }],
            shippingAddress: "123 Main St",
        })).rejects.toThrow("PayOS unavailable");
        expect(checkoutReservationService.releaseReservation).toHaveBeenCalledWith("reservation-token", "payos_checkout_create_failed");
    });

    it("keeps mock PayOS checkout pending until the simulator confirms payment", async () => {
        const { service, cartService, ordersService, checkoutReservationService, payosService } = buildService();
        env.paymentProviderMode = "mock";
        cartService.validateCheckoutSubmission.mockResolvedValue({
            cartItems: [{ product_id: 1, quantity: 1, price: 100, product_name: "Widget" }],
            authoritativeTotalPrice: 100,
            issues: [],
            mismatches: [],
        });
        checkoutReservationService.reserveInventory.mockResolvedValue(reservation);

        const result = await service.createCheckoutSession("user-1", {
            totalPrice: 100,
            cart: [{ productId: 1, quantity: 1, price: 100 }],
            shippingAddress: "123 Main St",
        });

        expect(result.url).toContain("/mock-payos-checkout");
        expect(result.url).toContain("payment_link_id=");
        expect(result.amount).toBe(2_250_000);
        expect(ordersService.finalizePayOSCheckout).not.toHaveBeenCalled();
        expect(payosService.createPaymentLink).not.toHaveBeenCalled();
        expect(checkoutReservationService.attachPaymentProvider).toHaveBeenCalledWith(
            "reservation-token",
            expect.objectContaining({
                provider: "payos",
                providerReference: expect.stringMatching(/^mock_payos_/),
                paymentAmount: 2_250_000,
                paymentCurrency: "VND",
            }),
        );
    });
});
