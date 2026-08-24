import { beforeEach, describe, expect, it, vi } from "vitest";
import { OrdersController } from "../orders.controller";
import { NestOrdersService } from "../orders.service";
import type { NestOrdersStripeService } from "../orders.stripe.service";

vi.mock("#src/config/database.config", () => ({
    default: {
        getConnection: (callback: (err: Error | null, connection?: unknown) => void) => callback(null, {}),
    },
}));

vi.mock("#src/config/stripe.config", () => ({
    stripeClient: { checkout: { sessions: { create: vi.fn() } } },
}));

vi.mock("#src/shared/utils/logger", () => ({
    logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

function callbackWithEmptyRows(...args: unknown[]) {
    const callback = args.at(-1) as (err: Error | null, rows: unknown[]) => void;
    callback(null, []);
}

describe("order access scoping", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("passes authenticated customer identity to order detail lookup", async () => {
        const getOrderDetail = vi.fn().mockResolvedValue({ id: 7 });
        const ordersService = { getOrderDetail } as unknown as NestOrdersService;
        const controller = new OrdersController(ordersService, {} as NestOrdersStripeService);
        const req = { user: { id: "customer-1", role: "Customer" } };

        await (controller.getOrderDetail as unknown as (oid: string, req: unknown) => Promise<unknown>)("7", req);

        expect(getOrderDetail).toHaveBeenCalledWith(7, "customer-1", "Customer");
    });

    it("passes authenticated customer identity to Stripe-session order lookup", async () => {
        const getOrderByStripeSessionId = vi.fn().mockResolvedValue({ id: 7 });
        const ordersService = { getOrderByStripeSessionId } as unknown as NestOrdersService;
        const controller = new OrdersController(ordersService, {} as NestOrdersStripeService);
        const req = { user: { id: "customer-1", role: "Customer" } };

        await (controller.getOrderBySessionId as unknown as (sessionId: string, req: unknown) => Promise<unknown>)("cs_test_1", req);

        expect(getOrderByStripeSessionId).toHaveBeenCalledWith("cs_test_1", "customer-1", "Customer");
    });

    it("scopes customer order detail queries to the requester id", async () => {
        const getOrderDetail = vi.fn(callbackWithEmptyRows);
        const repository = { getOrderDetail };
        const service = new NestOrdersService(
            repository as never,
            { getTimeline: vi.fn() } as never,
            {} as never,
            {} as never,
            {} as never,
        );

        await (service.getOrderDetail as unknown as (orderId: number, requesterId: string, requesterRole: string) => Promise<unknown>)(
            7,
            "customer-1",
            "Customer",
        );

        expect(getOrderDetail).toHaveBeenCalledWith(7, "customer-1", expect.any(Function));
    });

    it("does not apply an owner predicate for admin order detail queries", async () => {
        const getOrderDetail = vi.fn(callbackWithEmptyRows);
        const repository = { getOrderDetail };
        const service = new NestOrdersService(
            repository as never,
            { getTimeline: vi.fn() } as never,
            {} as never,
            {} as never,
            {} as never,
        );

        await (service.getOrderDetail as unknown as (orderId: number, requesterId: string, requesterRole: string) => Promise<unknown>)(
            7,
            "admin-1",
            "Admin",
        );

        expect(getOrderDetail).toHaveBeenCalledWith(7, null, expect.any(Function));
    });

    it("scopes customer Stripe-session queries to the requester id", async () => {
        const getOrderByStripeSessionId = vi.fn(callbackWithEmptyRows);
        const repository = { getOrderByStripeSessionId };
        const service = new NestOrdersService(
            repository as never,
            {} as never,
            {} as never,
            {} as never,
            {} as never,
        );

        await (service.getOrderByStripeSessionId as unknown as (
            sessionId: string,
            requesterId: string,
            requesterRole: string,
        ) => Promise<unknown>)("cs_test_1", "customer-1", "Customer");

        expect(getOrderByStripeSessionId).toHaveBeenCalledWith("cs_test_1", "customer-1", expect.any(Function));
    });
});
