import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("#src/config/env.config", () => ({
    env: {
        clientUrl: "http://localhost:5173",
        paymentProviderMode: "live",
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
vi.mock("../../payments/payment-attempt.service", () => ({ PaymentAttemptService: class {} }));

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

const paymentAttempt = {
    id: "attempt-123",
    pendingCheckoutId: 7,
    providerOrderCode: "123456789",
    expectedAmountVnd: 90,
    paymentState: "PENDING",
    orderState: "NOT_CREATED",
    resolutionState: "NONE",
    providerLinkId: null,
    providerLinkUrl: null,
    expiresAt: "2026-09-10T01:35:00.000Z",
    replayed: false,
};

function buildService() {
    const cartService = { validateCheckoutSubmission: vi.fn(), previewGuestCart: vi.fn() };
    const ordersService = {
        applyDiscount: vi.fn(),
        finalizePayOSCheckout: vi.fn(),
    };
    const payosService = {
        createPaymentLink: vi.fn(),
        findPaymentLinkByOrderCode: vi.fn(),
        cancelPaymentLink: vi.fn().mockResolvedValue(undefined),
    };
    const checkoutReservationService = {
        reserveInventory: vi.fn(),
        reservePayOSInventory: vi.fn(),
        attachPaymentProvider: vi.fn().mockResolvedValue(undefined),
        attachPayOSAttemptProvider: vi.fn().mockResolvedValue(undefined),
        releaseReservation: vi.fn().mockResolvedValue(undefined),
        expirePayOSOrder: vi.fn(),
    };
    const paymentAttemptService = {
        findExistingClaim: vi.fn().mockResolvedValue(null),
        getOwnedStatus: vi.fn(),
        acquireCreateLease: vi.fn().mockResolvedValue(true),
        saveProviderLink: vi.fn().mockResolvedValue(true),
    };

    return {
        service: new NestOrdersPayOSService(cartService as never, ordersService as never, payosService as never, checkoutReservationService as never, paymentAttemptService as never),
        cartService,
        ordersService,
        payosService,
        checkoutReservationService,
        paymentAttemptService,
    };
}

describe("NestOrdersPayOSService", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        env.paymentProviderMode = "live";
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
        checkoutReservationService.reservePayOSInventory.mockResolvedValue({ ...reservation, paymentAttempt });
        payosService.createPaymentLink.mockResolvedValue({
            orderCode: 123456789,
            amount: 90,
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
            amount: 90,
            currency: "VND",
        }));
        expect(payosService.createPaymentLink).toHaveBeenCalledWith(expect.objectContaining({
            amount: 90,
            returnUrl: expect.stringContaining("payos_order_code="),
        }));
    });

    it("replays the existing attempt before quote validation, even when its quote has expired", async () => {
        const { service, cartService, checkoutReservationService, paymentAttemptService } = buildService();
        paymentAttemptService.findExistingClaim.mockResolvedValue({
            id: "attempt-123",
            pendingCheckoutId: 7,
            providerOrderCode: "123456789",
            expectedAmountVnd: 90,
            paymentState: "PENDING",
            orderState: "NOT_CREATED",
            resolutionState: "NONE",
            providerLinkId: "link-123",
            providerLinkUrl: "https://pay.payos.vn/web/link-123",
            expiresAt: "2026-09-10T01:20:00.000Z",
            replayed: true,
        });

        const result = await service.createCheckoutSession("user-1", {
            totalPrice: 100,
            cart: [{ productId: 1, quantity: 1, price: 100 }],
            shippingAddress: "123 Main St",
        }, "3b4b0fd8-f820-4a70-a30e-cfc24c9f2bba");

        expect(result).toEqual(expect.objectContaining({
            attemptId: "attempt-123",
            sessionState: "READY",
            url: "https://pay.payos.vn/web/link-123",
            orderCode: 123456789,
            amount: 90,
            currency: "VND",
        }));
        expect(cartService.validateCheckoutSubmission).not.toHaveBeenCalled();
        expect(checkoutReservationService.reservePayOSInventory).not.toHaveBeenCalled();
    });

    it("returns a closed attempt without a checkout URL when its persisted expiry has passed", async () => {
        const { service, cartService, checkoutReservationService, paymentAttemptService, payosService } = buildService();
        paymentAttemptService.findExistingClaim.mockResolvedValue({
            ...paymentAttempt,
            providerLinkId: "link-123",
            providerLinkUrl: "https://pay.payos.vn/web/link-123",
            expiresAt: "2026-09-10T00:59:59.000Z",
            replayed: true,
        });

        const result = await service.createCheckoutSession("user-1", {
            totalPrice: 100,
            cart: [{ productId: 1, quantity: 1, price: 100 }],
            shippingAddress: "123 Main St",
        }, "3b4b0fd8-f820-4a70-a30e-cfc24c9f2bba");

        expect(result).toMatchObject({
            attemptId: "attempt-123",
            sessionState: "CLOSED",
            url: null,
            paymentLinkId: "link-123",
        });
        expect(cartService.validateCheckoutSubmission).not.toHaveBeenCalled();
        expect(checkoutReservationService.reservePayOSInventory).not.toHaveBeenCalled();
        expect(payosService.findPaymentLinkByOrderCode).not.toHaveBeenCalled();
        expect(payosService.createPaymentLink).not.toHaveBeenCalled();
    });

    it("rejects reusing an idempotency key with a changed checkout body", async () => {
        const { service, cartService, paymentAttemptService } = buildService();
        paymentAttemptService.findExistingClaim.mockRejectedValue(Object.assign(new Error("Idempotency key was already used"), { statusCode: 409 }));

        await expect(service.createCheckoutSession("user-1", {
            totalPrice: 100,
            cart: [{ productId: 1, quantity: 2, price: 50 }],
            shippingAddress: "123 Main St",
        }, "3b4b0fd8-f820-4a70-a30e-cfc24c9f2bba")).rejects.toMatchObject({ statusCode: 409 });
        expect(cartService.validateCheckoutSubmission).not.toHaveBeenCalled();
    });

    it("uses the saved attempt code to look up an early callback link without creating another code", async () => {
        const { service, cartService, paymentAttemptService, payosService } = buildService();
        paymentAttemptService.findExistingClaim.mockResolvedValue({
            ...paymentAttempt,
            providerLinkId: "early-link-123",
            providerLinkUrl: null,
            replayed: true,
        });

        const result = await service.createCheckoutSession("user-1", {
            totalPrice: 100,
            cart: [{ productId: 1, quantity: 1, price: 100 }],
            shippingAddress: "123 Main St",
        }, "3b4b0fd8-f820-4a70-a30e-cfc24c9f2bba");

        expect(result).toMatchObject({
            attemptId: "attempt-123",
            sessionState: "READY",
            orderCode: 123456789,
            paymentLinkId: "early-link-123",
            url: "https://pay.payos.vn/web/early-link-123",
        });
        expect(cartService.validateCheckoutSubmission).not.toHaveBeenCalled();
        expect(payosService.createPaymentLink).not.toHaveBeenCalled();
    });

    it("looks up after a create timeout and retries only after authoritative not-found using the same code", async () => {
        const { service, cartService, checkoutReservationService, payosService } = buildService();
        const calls: string[] = [];
        cartService.validateCheckoutSubmission.mockResolvedValue({
            cartItems: [{ product_id: 1, quantity: 1, price: 100, product_name: "Widget" }],
            authoritativeTotalPrice: 100,
            issues: [],
            mismatches: [],
        });
        checkoutReservationService.reservePayOSInventory.mockResolvedValue({ ...reservation, paymentAttempt });
        payosService.createPaymentLink.mockImplementation(async (request: { orderCode: number }) => {
            calls.push(`create:${request.orderCode}`);
            if (calls.length === 1) throw new Error("timeout");
            return { orderCode: request.orderCode, amount: 90, currency: "VND", paymentLinkId: "link-123", checkoutUrl: "https://pay.payos.vn/web/link-123", status: "PENDING" };
        });
        payosService.findPaymentLinkByOrderCode.mockImplementation(async (orderCode: number) => {
            calls.push(`lookup:${orderCode}`);
            return null;
        });

        const result = await service.createCheckoutSession("user-1", {
            totalPrice: 100,
            cart: [{ productId: 1, quantity: 1, price: 100 }],
            shippingAddress: "123 Main St",
        });

        expect(calls).toEqual(["create:123456789", "lookup:123456789", "create:123456789"]);
        expect(result).toMatchObject({ sessionState: "READY", orderCode: 123456789, url: "https://pay.payos.vn/web/link-123" });
    });

    it("lets only one concurrent request acquire the create lease", async () => {
        const { service, cartService, checkoutReservationService, paymentAttemptService, payosService } = buildService();
        let leases = 0;
        paymentAttemptService.acquireCreateLease.mockImplementation(async () => ++leases === 1);
        cartService.validateCheckoutSubmission.mockResolvedValue({
            cartItems: [{ product_id: 1, quantity: 1, price: 100, product_name: "Widget" }],
            authoritativeTotalPrice: 100,
            issues: [],
            mismatches: [],
        });
        checkoutReservationService.reservePayOSInventory.mockResolvedValue({ ...reservation, paymentAttempt });
        let resolveCreate!: (link: unknown) => void;
        payosService.createPaymentLink.mockImplementation(() => new Promise((resolve) => { resolveCreate = resolve; }));

        const first = service.createCheckoutSession("user-1", { totalPrice: 100, cart: [{ productId: 1, quantity: 1, price: 100 }], shippingAddress: "123 Main St" }, "3b4b0fd8-f820-4a70-a30e-cfc24c9f2bba");
        const second = service.createCheckoutSession("user-1", { totalPrice: 100, cart: [{ productId: 1, quantity: 1, price: 100 }], shippingAddress: "123 Main St" }, "3b4b0fd8-f820-4a70-a30e-cfc24c9f2bba");
        await vi.waitFor(() => expect(payosService.createPaymentLink).toHaveBeenCalledTimes(1));
        resolveCreate({ orderCode: 123456789, amount: 90, currency: "VND", paymentLinkId: "link-123", checkoutUrl: "https://pay.payos.vn/web/link-123", status: "PENDING" });

        const results = await Promise.all([first, second]);
        expect(results.map((result) => result.sessionState)).toContain("CREATING");
        expect(payosService.createPaymentLink).toHaveBeenCalledTimes(1);
    });

    it("does not return a replacement guest order capability when replaying a guest attempt", async () => {
        const { service, cartService, checkoutReservationService, paymentAttemptService } = buildService();
        paymentAttemptService.acquireCreateLease.mockResolvedValue(false);
        paymentAttemptService.findExistingClaim.mockResolvedValue({
            id: "attempt-guest",
            pendingCheckoutId: 7,
            providerOrderCode: "123456790",
            expectedAmountVnd: 90,
            paymentState: "PENDING",
            orderState: "NOT_CREATED",
            resolutionState: "NONE",
            providerLinkId: null,
            providerLinkUrl: null,
            expiresAt: "2026-09-10T01:20:00.000Z",
            replayed: true,
        });

        const result = await service.createGuestCheckoutSession({
            cart: [{ productId: 1, quantity: 1 }],
            contact: { email: "buyer@example.com", name: "Buyer Name", phone: "+84123456789" },
            shipping: { address: "123 Main St", city: "HCMC", country: "VN" },
            paymentMethod: "payos",
        }, "11111111-1111-4111-8111-111111111111", "3b4b0fd8-f820-4a70-a30e-cfc24c9f2bba");

        expect(result).toEqual(expect.objectContaining({ attemptId: "attempt-guest", sessionState: "CREATING", url: null }));
        expect(result).not.toHaveProperty("guestOrderToken");
        expect(cartService.previewGuestCart).not.toHaveBeenCalled();
        expect(checkoutReservationService.reservePayOSInventory).not.toHaveBeenCalled();
    });

    it("creates the guest link, stores only a server-side provider reference, and returns the guest token once", async () => {
        const { service, cartService, checkoutReservationService, payosService } = buildService();
        cartService.previewGuestCart.mockResolvedValue({
            cartItems: [{ product_id: 1, quantity: 1, price: 100, product_name: "Widget" }],
            merchandiseTotal: 100,
            issues: [],
            promotion: { valid: true, discount: 10 },
        });
        checkoutReservationService.reservePayOSInventory.mockResolvedValue({ ...reservation, paymentAttempt });
        payosService.createPaymentLink.mockResolvedValue({
            orderCode: 123456789,
            amount: 90,
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
        }, "11111111-1111-4111-8111-111111111111");

        expect(result).toEqual(expect.objectContaining({
            url: "https://pay.payos.vn/web/link-123",
            paymentLinkId: "link-123",
            amount: 90,
            currency: "VND",
            guestOrderToken: expect.any(String),
        }));
        expect(checkoutReservationService.attachPayOSAttemptProvider).toHaveBeenCalledWith(7, expect.objectContaining({
            provider: "payos",
            providerReference: "link-123",
            providerOrderCode: result.orderCode,
            paymentAmount: 90,
            paymentCurrency: "VND",
            paymentFxRate: 1,
        }));
        const request = payosService.createPaymentLink.mock.calls[0][0];
        expect(JSON.stringify(request)).not.toContain("buyer@example.com");
        expect(JSON.stringify(request)).not.toContain(result.guestOrderToken);
        expect(JSON.stringify(request)).not.toContain("reservation-token");
    });

    it("retains the reservation when PayOS create and lookup outcomes are unknown", async () => {
        const { service, cartService, checkoutReservationService, payosService } = buildService();
        cartService.validateCheckoutSubmission.mockResolvedValue({
            cartItems: [{ product_id: 1, quantity: 1, price: 10 }],
            authoritativeTotalPrice: 10,
            issues: [],
            mismatches: [],
        });
        checkoutReservationService.reservePayOSInventory.mockResolvedValue({ ...reservation, paymentAttempt: { ...paymentAttempt, expectedAmountVnd: 10 } });
        payosService.createPaymentLink.mockRejectedValue(new Error("PayOS unavailable"));
        payosService.findPaymentLinkByOrderCode.mockRejectedValue(new Error("PayOS unavailable"));

        const result = await service.createCheckoutSession("user-1", {
            totalPrice: 10,
            cart: [{ productId: 1, quantity: 1, price: 10 }],
            shippingAddress: "123 Main St",
        });
        expect(result).toMatchObject({ attemptId: "attempt-123", sessionState: "CREATING", url: null });
        expect(checkoutReservationService.releaseReservation).not.toHaveBeenCalled();
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
        checkoutReservationService.reservePayOSInventory.mockResolvedValue({ ...reservation, paymentAttempt });

        const result = await service.createCheckoutSession("user-1", {
            totalPrice: 100,
            cart: [{ productId: 1, quantity: 1, price: 100 }],
            shippingAddress: "123 Main St",
        });

        expect(result.url).toContain("/mock-payos-checkout");
        expect(result.url).toContain("payment_link_id=");
        expect(result.amount).toBe(90);
        expect(ordersService.finalizePayOSCheckout).not.toHaveBeenCalled();
        expect(payosService.createPaymentLink).not.toHaveBeenCalled();
        expect(checkoutReservationService.attachPayOSAttemptProvider).toHaveBeenCalledWith(
            7,
            expect.objectContaining({
                provider: "payos",
                providerReference: expect.stringMatching(/^mock_payos_/),
                paymentAmount: 90,
                paymentCurrency: "VND",
            }),
        );
    });

    it("rejects a live checkout URL outside the configured PayOS origin allowlist", async () => {
        const { service, cartService, checkoutReservationService, payosService, paymentAttemptService } = buildService();
        cartService.validateCheckoutSubmission.mockResolvedValue({
            cartItems: [{ product_id: 1, quantity: 1, price: 100, product_name: "Widget" }],
            authoritativeTotalPrice: 100,
            issues: [],
            mismatches: [],
        });
        checkoutReservationService.reservePayOSInventory.mockResolvedValue({ ...reservation, paymentAttempt });
        payosService.createPaymentLink.mockResolvedValue({
            orderCode: 123456789,
            amount: 90,
            currency: "VND",
            paymentLinkId: "link-123",
            checkoutUrl: "https://attacker.example/steal",
            status: "PENDING",
        });

        await expect(service.createCheckoutSession("user-1", {
            totalPrice: 100,
            cart: [{ productId: 1, quantity: 1, price: 100 }],
            shippingAddress: "123 Main St",
        })).rejects.toThrow();
        expect(paymentAttemptService.saveProviderLink).not.toHaveBeenCalled();
        expect(checkoutReservationService.releaseReservation).not.toHaveBeenCalled();
    });

    it.each([
        ["order code", { orderCode: 9 }],
        ["amount", { amount: 91 }],
        ["currency", { currency: "USD" }],
    ])("rejects a live provider response with a mismatched %s", async (_field, responseOverride) => {
        const { service, cartService, checkoutReservationService, payosService, paymentAttemptService } = buildService();
        cartService.validateCheckoutSubmission.mockResolvedValue({
            cartItems: [{ product_id: 1, quantity: 1, price: 100, product_name: "Widget" }],
            authoritativeTotalPrice: 100,
            issues: [],
            mismatches: [],
        });
        payosService.createPaymentLink.mockResolvedValue({
            orderCode: 123456789,
            amount: 90,
            currency: "VND",
            paymentLinkId: "link-123",
            checkoutUrl: "https://pay.payos.vn/web/link-123",
            status: "PENDING",
            ...responseOverride,
        });

        await expect(service.createCheckoutSession("user-1", {
            totalPrice: 100,
            cart: [{ productId: 1, quantity: 1, price: 100 }],
            shippingAddress: "123 Main St",
        })).rejects.toThrow();
        expect(paymentAttemptService.saveProviderLink).not.toHaveBeenCalled();
        expect(checkoutReservationService.releaseReservation).not.toHaveBeenCalled();
    });
});
