import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../orders.service", () => ({ NestOrdersService: class {} }));
import { OrdersController } from "../orders.controller";
import type { NestOrdersService } from "../orders.service";

vi.mock("#src/shared/utils/logger", () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() } }));

function buildController() {
    const ordersService = {
        applyDiscount: vi.fn(), makePurchase: vi.fn(), changeOrderStatus: vi.fn(), getOrderDetail: vi.fn(), getAdminPendingQueue: vi.fn(),
    } as unknown as NestOrdersService;
    return { controller: new OrdersController(ordersService), ordersService };
}
const customerRequest = (id: string) => ({ user: { id, role: "customer" } }) as never;
const adminRequest = () => ({ user: { id: "admin-1", role: "admin" } }) as never;

describe("OrdersController", () => {
    beforeEach(() => vi.clearAllMocks());

    it("recomputes cash checkout discount from the submitted coupon code", async () => {
        const { controller, ordersService } = buildController();
        vi.mocked(ordersService.applyDiscount).mockResolvedValue({ id: 1, discount_code: "SAVE10", discount_percent: 10, min_order_value: 0 });
        vi.mocked(ordersService.makePurchase).mockResolvedValue({ id: 7, date_added: "2026-08-24T00:00:00.000Z" });
        await controller.makePurchase("user-1", { totalPrice: 100, cart: [{ productId: 1, quantity: 1, price: 100 }], discount: 99, discountCode: "SAVE10", shippingAddress: "123 Main St", paymentMethod: "cash" });
        expect(ordersService.applyDiscount).toHaveBeenCalledWith("SAVE10", "user-1");
        expect(ordersService.makePurchase).toHaveBeenCalledWith("user-1", expect.objectContaining({ discount: 10 }));
    });

    it.each(["unsupported_provider", "card", "bank_transfer"])("rejects %s before persistence", async (paymentMethod) => {
        const { controller, ordersService } = buildController();
        await expect(controller.makePurchase("user-1", { totalPrice: 100_000, cart: [{ productId: 7, quantity: 1, price: 100_000 }], discount: 0, shippingAddress: "Test address", paymentMethod })).rejects.toMatchObject({ status: 400 });
        expect(ordersService.makePurchase).not.toHaveBeenCalled();
    });

    it("does not expose another customer's order detail", async () => {
        const { controller, ordersService } = buildController();
        vi.mocked(ordersService.getOrderDetail).mockResolvedValue({ id: 42, user_id: "owner-1", items: [] } as never);
        await expect(controller.getOrderDetail("42", customerRequest("attacker-1"))).rejects.toMatchObject({ status: 404 });
    });

    it("allows an admin to inspect any order", async () => {
        const { controller, ordersService } = buildController();
        vi.mocked(ordersService.getOrderDetail).mockResolvedValue({ id: 42, user_id: "owner-1", items: [] } as never);
        await expect(controller.getOrderDetail("42", adminRequest())).resolves.toMatchObject({ order: { id: 42 } });
    });

    it("passes the authenticated admin actor to the order status transition", async () => {
        const { controller, ordersService } = buildController();
        vi.mocked(ordersService.changeOrderStatus).mockResolvedValue({ id: 41, status: 1 } as never);
        await controller.changeOrderStatus("41", adminRequest(), { status: 1 });
        expect(ordersService.changeOrderStatus).toHaveBeenCalledWith(41, 1, "admin-1");
    });

    it("returns the bounded admin pending-order queue", async () => {
        const { controller, ordersService } = buildController();
        vi.mocked(ordersService.getAdminPendingQueue).mockResolvedValue([{ id: 42, status: 0 }] as never);

        await expect(controller.getAdminPendingQueue()).resolves.toMatchObject({
            orders: [{ id: 42, status: 0 }],
        });
        expect(ordersService.getAdminPendingQueue).toHaveBeenCalledOnce();
    });

    it("returns attempt identity and session state for authenticated PayOS checkout", async () => {
        const payosService = {
            createCheckoutSession: vi.fn().mockResolvedValue({
                attemptId: "11111111-1111-4111-8111-111111111111", sessionState: "CREATING", url: null,
                orderCode: 123456789, paymentLinkId: null, amount: 100, currency: "VND",
            }),
        };
        const controller = new OrdersController({} as never, payosService as never);

        await expect(controller.createPayOSCheckoutSession("user-1", {
            shippingQuoteId: "quote-1", deliveryAddress: {} as never, totalPrice: 100,
            cart: [{ productId: 1, quantity: 1, price: 100 }], discount: 0, shippingAddress: "address",
        })).resolves.toMatchObject({ attemptId: "11111111-1111-4111-8111-111111111111", sessionState: "CREATING" });
    });

    it("binds simulated PayOS confirmation to the supplied payment attempt", async () => {
        const payosService = { confirmMockPayment: vi.fn().mockResolvedValue({ id: 827 }) };
        const controller = new OrdersController({} as never, payosService as never);
        const payload = {
            paymentAttemptId: "11111111-1111-4111-8111-111111111111",
            orderCode: 123456789,
            paymentLinkId: "mock-link",
            amount: 100,
        };

        await expect(controller.confirmMockPayOSPayment(payload)).resolves.toMatchObject({ orderId: 827 });
        expect(payosService.confirmMockPayment).toHaveBeenCalledWith(payload.paymentAttemptId, payload.orderCode, payload.paymentLinkId, payload.amount);
    });

    it("rejects malformed authenticated PayOS idempotency keys before creating a session", async () => {
        const payosService = { createCheckoutSession: vi.fn() };
        const controller = new OrdersController({} as never, payosService as never);

        await expect(controller.createPayOSCheckoutSession("user-1", {
            shippingQuoteId: "quote-1", deliveryAddress: {} as never, totalPrice: 100,
            cart: [{ productId: 1, quantity: 1, price: 100 }], discount: 0, shippingAddress: "address",
        }, "not-a-uuid")).rejects.toMatchObject({ status: 400 });
        expect(payosService.createCheckoutSession).not.toHaveBeenCalled();
    });
});
