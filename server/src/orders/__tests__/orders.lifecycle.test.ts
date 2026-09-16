import { beforeEach, describe, expect, it, vi } from "vitest";

const { withTransaction } = vi.hoisted(() => ({ withTransaction: vi.fn() }));

vi.mock("../../database/transaction", () => ({ withTransaction }));
vi.mock("#src/shared/utils/logger", () => ({
    logger: { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() },
}));
vi.mock("../orders.repository", () => ({ OrdersRepository: class {} }));
vi.mock("../orders.timeline.service", () => ({ NestOrderTimelineService: class {} }));
vi.mock("../../cart/cart.service", () => ({ NestCartService: class {} }));
vi.mock("../../inventory/inventory.service", () => ({ NestInventoryService: class {} }));
vi.mock("../../notifications/notifications.service", () => ({ NestNotificationsService: class {} }));
vi.mock("../checkout-reservation.repository", () => ({ CheckoutReservationRepository: class {} }));

import { NestOrdersService } from "../orders.service";

type RepositoryCallback = (error: Error | null, rows: unknown) => void;

function buildService({ paidStripe = false, orderId = 9, paymentProvider: ledgerProvider, paymentStatus = "pending", initialOrderStatus = 0, deliveredAt = null } = {}) {
    const tx = { query: vi.fn() };
    let orderStatus = initialOrderStatus;
    const orderRepository = {
        getOrderById: vi.fn((_id: number, callback: RepositoryCallback) => callback(null, [{
            id: orderId,
            user_id: "user-1",
            status: orderStatus,
            total_price: 50,
            discount: 0,
            date_added: "2026-09-07T00:00:00.000Z",
        }])),
    };
    const timeline = { createTimelineEventInTransaction: vi.fn().mockResolvedValue(undefined) };
    const inventory = { createMovementsInTransaction: vi.fn().mockResolvedValue(undefined) };
    const notifications = { notifyOrderStatus: vi.fn() };
    const paymentProvider = { refundPayment: vi.fn().mockResolvedValue({
        status: "refunded",
        providerReference: "pi_9",
        refundReference: "re_9",
        simulated: true,
    }) };

    tx.query.mockImplementation(async (sql: string) => {
        const normalizedSql = sql.trimStart();
        if (sql.includes("SELECT user_id, status") && sql.includes("FROM orders")) {
            return [{ user_id: "user-1", status: orderStatus, delivered_at: deliveredAt }];
        }
        if (sql.includes("SELECT id, user_id, status, total_price")) {
            return [{ id: 9, user_id: "user-1", status: orderStatus, total_price: 50, discount: 0 }];
        }
        if (sql.includes("FROM order_payments")) {
            if (paidStripe) return [{ id: 3, provider: "stripe", status: "paid", provider_payment_id: "pi_9", amount: 50, currency: "USD" }];
            if (ledgerProvider) return [{ id: orderId, provider: ledgerProvider, status: paymentStatus, provider_payment_id: "pay_4", amount: 50, currency: "VND" }];
            return [];
        }
        if (normalizedSql.startsWith("SELECT") && sql.includes("inventory_restored_at")) {
            return [{ user_id: "user-1", status: orderStatus, inventory_restored_at: null }];
        }
        if (sql.includes("FROM order_items")) return [{ product_id: 4, quantity: 2 }];
        if (sql.includes("FROM products")) return [{ id: 4, stock: 5 }];
        if (normalizedSql.startsWith("UPDATE orders")) {
            if (sql.includes("status = 1")) orderStatus = 1;
            else if (!sql.includes("delivered_at")) orderStatus = 2;
            return { affectedRows: 1 };
        }
        return { affectedRows: 1 };
    });
    withTransaction.mockImplementation(async (work: (transaction: typeof tx) => Promise<unknown>) => work(tx));

    const service = new NestOrdersService(
        orderRepository as never,
        timeline as never,
        {} as never,
        inventory as never,
        notifications as never,
        {} as never,
        {} as never,
        {} as never,
        paymentProvider as never,
    );

    return { service, tx, orderRepository, timeline, inventory, notifications, paymentProvider };
}

describe("order lifecycle", () => {
    beforeEach(() => vi.clearAllMocks());

    it("cancels a pending order, restores stock, and emits timeline and notification once", async () => {
        const { service, tx, timeline, inventory, notifications } = buildService();

        await expect(service.cancelOrder(9, "user-1")).resolves.toMatchObject({ id: 9, status: 2 });
        await expect(service.cancelOrder(9, "user-1")).resolves.toMatchObject({ id: 9, status: 2 });

        expect(tx.query).toHaveBeenCalledWith("UPDATE products SET stock = stock + ? WHERE id = ?", [2, 4]);
        expect(inventory.createMovementsInTransaction).toHaveBeenCalledTimes(1);
        expect(timeline.createTimelineEventInTransaction).toHaveBeenCalledWith(tx, expect.objectContaining({
            orderId: 9,
            status: 2,
            actorId: "user-1",
        }));
        expect(timeline.createTimelineEventInTransaction).toHaveBeenCalledTimes(1);
        expect(notifications.notifyOrderStatus).toHaveBeenCalledTimes(1);
    });

    it("refunds a paid Stripe order before canceling it", async () => {
        const { service, paymentProvider, tx, timeline } = buildService({ paidStripe: true });

        await expect(service.cancelOrder(9, "user-1")).resolves.toMatchObject({ id: 9, status: 2 });

        expect(paymentProvider.refundPayment).toHaveBeenCalledWith(expect.objectContaining({
            provider: "stripe",
            orderId: 9,
            paymentId: "pi_9",
            amount: 50,
            currency: "USD",
        }));
        expect(tx.query).toHaveBeenCalledWith(expect.stringContaining("status = 'refunded'"), ["re_9", 9]);
        expect(timeline.createTimelineEventInTransaction).toHaveBeenCalledTimes(1);
    });
    it("sets delivered_at and marks a pending COD ledger paid once", async () => {
        const { service, tx } = buildService({ orderId: 41, paymentProvider: "cash" });
        const result = await service.changeOrderStatus(41, 1, "admin-1");
        expect(result.status).toBe(1);
        expect(tx.query).toHaveBeenCalledWith(
            expect.stringContaining("UPDATE orders SET status = 1, delivered_at = COALESCE(delivered_at, UTC_TIMESTAMP())"),
            [41],
        );
        const cashPaymentUpdate = tx.query.mock.calls.find(([sql]) => String(sql).includes("UPDATE order_payments SET status = 'paid'"));
        expect(cashPaymentUpdate?.[0]).toEqual(expect.stringContaining("reconciliation_status = 'MANUAL_CONFIRMED'"));
        expect(cashPaymentUpdate?.[0]).toEqual(expect.stringContaining("last_reconciled_at = UTC_TIMESTAMP()"));
        expect(cashPaymentUpdate?.[0]).toEqual(expect.stringContaining("provider_status = 'COLLECTED'"));
        expect(cashPaymentUpdate?.[1]).toEqual([41]);
    });

    it("does not complete an unpaid PayOS order as delivered", async () => {
        const { service } = buildService({ orderId: 42, paymentProvider: "payos" });
        await expect(service.changeOrderStatus(42, 1, "admin-1")).rejects.toMatchObject({ statusCode: 409 });
    });

    it("repeating Done does not add a second delivery event or payment update", async () => {
        const { service, tx, timeline } = buildService({ orderId: 41, paymentProvider: "cash" });
        await service.changeOrderStatus(41, 1, "admin-1");
        await service.changeOrderStatus(41, 1, "admin-1");
        expect(timeline.createTimelineEventInTransaction).toHaveBeenCalledTimes(1);
        expect(tx.query.mock.calls.filter(([sql]) => String(sql).includes("UPDATE order_payments SET status = 'paid'")).length).toBe(1);
    });

    it("backfills a missing timestamp on a legacy delivered PayOS order without rejecting or paying it", async () => {
        const { service, tx, timeline } = buildService({
            orderId: 42,
            paymentProvider: "payos",
            initialOrderStatus: 1,
        });

        await expect(service.changeOrderStatus(42, 1, "admin-1")).resolves.toMatchObject({ id: 42, status: 1 });

        expect(tx.query).toHaveBeenCalledWith(
            "UPDATE orders SET delivered_at = COALESCE(delivered_at, UTC_TIMESTAMP()) WHERE id = ?",
            [42],
        );
        expect(tx.query.mock.calls.filter(([sql]) => String(sql).includes("UPDATE order_payments SET status = 'paid'")).length).toBe(0);
        expect(timeline.createTimelineEventInTransaction).not.toHaveBeenCalled();
    });
});
