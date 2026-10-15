import { beforeEach, describe, expect, it, vi } from "vitest";
import { PaymentReconciliationService } from "../../payments/payment-reconciliation.service";
import { OrdersController } from "../orders.controller";
import { GuestOrdersController } from "../guest-orders.controller";
import { AuthModule } from "../../auth/auth.module";

vi.mock("../orders.service", () => ({ NestOrdersService: class {} }));
vi.mock("../orders.payos.service", () => ({ NestOrdersPayOSService: class {} }));

const attemptId = "11111111-1111-4111-8111-111111111111";
const status = {
    attemptId, providerOrderCode: "123456789", paymentState: "PENDING", orderState: "NOT_CREATED",
    resolutionState: "NONE", orderId: null, items: [], delivery: null, subtotalVnd: 10, discountVnd: 0,
    shippingVnd: 0, payableVnd: 10, currency: "VND", expiresAt: new Date().toISOString(),
    lastCheckedAt: null, retryAfterSeconds: null, supportReference: "PAY-11111111", resumeUrl: null,
};

describe("payment attempt owner routes", () => {
    beforeEach(() => vi.clearAllMocks());

    it("returns only the authenticated owner projection and disables caching", async () => {
        const service = {
            getOwnedAttemptStatus: vi.fn().mockResolvedValue(status),
        } as unknown as PaymentReconciliationService;
        const controller = new OrdersController({} as never, undefined, service);
        const response = { setHeader: vi.fn() };

        await expect(controller.getPaymentAttemptStatus(attemptId, { user: { id: "owner-1" } } as never, response as never))
            .resolves.toMatchObject({ paymentAttempt: { attemptId, providerOrderCode: "123456789" } });
        expect(response.setHeader).toHaveBeenCalledWith("Cache-Control", "no-store");
        expect(service.getOwnedAttemptStatus).toHaveBeenCalledWith(attemptId, { kind: "authenticated", userId: "owner-1" });
    });

    it("uses the guest cookie as owner identity and ignores any body user ID", async () => {
        const service = {
            getOwnedAttemptStatus: vi.fn().mockResolvedValue(status),
            requestOwnedReconciliation: vi.fn().mockResolvedValue({ accepted: true, retryAfterSeconds: 15 }),
        } as unknown as PaymentReconciliationService;
        const controller = new GuestOrdersController({} as never, undefined, service);
        const req = { cookies: { digitalEGuestCartId: "11111111-1111-4111-8111-111111111111" }, body: { userId: "attacker" } };

        await expect(controller.getGuestPaymentAttemptStatus(attemptId, req as never, { setHeader: vi.fn() } as never))
            .resolves.toMatchObject({ paymentAttempt: { attemptId } });
        await expect(controller.reconcileGuestPaymentAttempt(attemptId, req as never))
            .resolves.toMatchObject({ accepted: true, retryAfterSeconds: 15 });
        expect(service.getOwnedAttemptStatus).toHaveBeenCalledWith(attemptId, { kind: "guest", guestCartId: req.cookies.digitalEGuestCartId });
        expect(service.requestOwnedReconciliation).toHaveBeenCalledWith(attemptId, { kind: "guest", guestCartId: req.cookies.digitalEGuestCartId });
    });

    it("rejects guest recovery without the validated cookie identity", async () => {
        const service = { getOwnedAttemptStatus: vi.fn() } as unknown as PaymentReconciliationService;
        const controller = new GuestOrdersController({} as never, undefined, service);
        await expect(controller.getGuestPaymentAttemptStatus(attemptId, { cookies: {} } as never, { setHeader: vi.fn() } as never))
            .rejects.toMatchObject({ status: 403 });
        expect(service.getOwnedAttemptStatus).not.toHaveBeenCalled();
    });

    it("returns the same service 404 for an unknown or wrong-owner attempt", async () => {
        const notFound = Object.assign(new Error("Payment attempt not found"), { statusCode: 404 });
        const service = { getOwnedAttemptStatus: vi.fn().mockRejectedValue(notFound) } as unknown as PaymentReconciliationService;
        const controller = new OrdersController({} as never, undefined, service);
        await expect(controller.getPaymentAttemptStatus(attemptId, { user: { id: "other-user" } } as never, { setHeader: vi.fn() } as never))
            .rejects.toBe(notFound);
    });

    it("schedules authenticated reconciliation and cancellation from the session owner", async () => {
        const service = {
            requestOwnedReconciliation: vi.fn().mockResolvedValue({ accepted: true, retryAfterSeconds: 11 }),
            requestOwnedCancellation: vi.fn().mockResolvedValue({ accepted: true, orderId: null, retryAfterSeconds: 15 }),
        } as unknown as PaymentReconciliationService;
        const controller = new OrdersController({} as never, undefined, service);
        const req = { user: { id: "owner-1" }, body: { userId: "attacker" } };

        await expect(controller.reconcilePaymentAttempt(attemptId, req as never)).resolves.toMatchObject({ accepted: true, retryAfterSeconds: 11 });
        await expect(controller.cancelPaymentAttempt(attemptId, req as never)).resolves.toMatchObject({ accepted: true, retryAfterSeconds: 15 });
        expect(service.requestOwnedReconciliation).toHaveBeenCalledWith(attemptId, { kind: "authenticated", userId: "owner-1" });
        expect(service.requestOwnedCancellation).toHaveBeenCalledWith(attemptId, { kind: "authenticated", userId: "owner-1" });
    });

    it("does not cancel a committed order through the authenticated payment-attempt route", async () => {
        const service = {
            requestOwnedCancellation: vi.fn().mockResolvedValue({ accepted: false, orderId: 7, retryAfterSeconds: 0 }),
        } as unknown as PaymentReconciliationService;
        const ordersService = { cancelOrder: vi.fn() };
        const controller = new OrdersController(ordersService as never, undefined, service);

        await expect(controller.cancelPaymentAttempt(attemptId, { user: { id: "owner-1" } } as never))
            .rejects.toMatchObject({ status: 409 });
        expect(ordersService.cancelOrder).not.toHaveBeenCalled();
    });

    it("does not cancel a committed order through the guest payment-attempt route", async () => {
        const service = {
            requestOwnedCancellation: vi.fn().mockResolvedValue({ accepted: false, orderId: 7, retryAfterSeconds: 0 }),
        } as unknown as PaymentReconciliationService;
        const controller = new GuestOrdersController({} as never, undefined, service);
        const req = { cookies: { digitalEGuestCartId: "11111111-1111-4111-8111-111111111111" } };

        await expect(controller.cancelGuestPaymentAttempt(attemptId, req as never))
            .rejects.toMatchObject({ status: 409 });
    });

    it("keeps guest mutation routes inside the existing global CSRF protection", () => {
        const excludedRoutes: unknown[] = [];
        const config = {
            exclude: vi.fn((...routes: unknown[]) => { excludedRoutes.push(...routes); return config; }),
            forRoutes: vi.fn(),
        };
        const consumer = { apply: vi.fn(() => config) } as never;
        new AuthModule().configure(consumer);
        expect(excludedRoutes).not.toContain("orders/guest/payment-attempts/:attemptId/status");
        expect(excludedRoutes).not.toContain("orders/guest/payment-attempts/:attemptId/reconcile");
        expect(excludedRoutes).not.toContain("orders/guest/payment-attempts/:attemptId/cancel");
        expect(config.forRoutes).toHaveBeenCalledWith("*");
    });
});
