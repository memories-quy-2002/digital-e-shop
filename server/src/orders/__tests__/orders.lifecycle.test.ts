import { beforeEach, describe, expect, it, vi } from "vitest";

const { withTransaction } = vi.hoisted(() => ({ withTransaction: vi.fn() }));

vi.mock("../../database/transaction", () => ({ withTransaction }));
vi.mock("#src/shared/utils/logger", () => ({
    logger: { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() },
}));
vi.mock("../orders.timeline.service", () => ({ NestOrderTimelineService: class {} }));
vi.mock("../../cart/cart.service", () => ({ NestCartService: class {} }));
vi.mock("../../inventory/inventory.service", () => ({ NestInventoryService: class {} }));
vi.mock("../../notifications/notifications.service", () => ({ NestNotificationsService: class {} }));
vi.mock("../checkout-reservation.repository", () => ({ CheckoutReservationRepository: class {} }));

import { NestOrdersService } from "../orders.service";
import { OrdersRepository } from "../orders.repository";
import { NestOrdersCancellationService } from "../orders-cancellation.service";
import { Test } from "@nestjs/testing";
import { OrdersModule } from "../orders.module";
import { NestOrderTimelineService } from "../orders.timeline.service";
import { NestInventoryService } from "../../inventory/inventory.service";
import { NestNotificationsService } from "../../notifications/notifications.service";

type RepositoryCallback = (error: Error | null, rows: unknown) => void;

function buildService({ orderId = 9, paymentProvider: ledgerProvider, paymentStatus = "pending", initialOrderStatus = 0, deliveredAt = null, restoredAt = null, simulated = false, userId = "user-1", items = [{ product_id: 4, quantity: 2 }], productRows = [{ id: 4, price: 100, sale_price: null, stock: 5 }], productStockAffectedRows = 1, alerts = undefined } = {}) {
    const tx = { query: vi.fn() };
    let orderStatus = initialOrderStatus;
    const orderRepository = Object.assign(new OrdersRepository({} as never), {
        getOrderById: vi.fn((_id: number, callback: RepositoryCallback) => callback(null, [{
            id: orderId,
            user_id: "user-1",
            status: orderStatus,
            total_price: 50,
            discount: 0,
            date_added: "2026-09-07T00:00:00.000Z",
        }])),
    });
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
            return [{ user_id: userId, status: orderStatus, delivered_at: deliveredAt, inventory_restored_at: restoredAt }];
        }
        if (sql.includes("SELECT id, user_id, status, total_price")) {
            return [{ id: 9, user_id: "user-1", status: orderStatus, total_price: 50, discount: 0 }];
        }
        if (sql.includes("FROM order_payments")) {
            if (ledgerProvider) return [{ id: orderId, provider: ledgerProvider, status: paymentStatus, simulated, provider_payment_id: "pay_4", amount: 50, currency: "VND" }];
            return [];
        }
        if (normalizedSql.startsWith("SELECT") && sql.includes("inventory_restored_at")) {
            return [{ user_id: "user-1", status: orderStatus, inventory_restored_at: null }];
        }
        if (sql.includes("FROM order_items")) return items;
        if (sql.includes("FROM products")) return productRows;
        if (normalizedSql.startsWith("UPDATE products")) return { affectedRows: productStockAffectedRows };
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
        new NestOrdersCancellationService(orderRepository, timeline as never, inventory as never, alerts as never),
        paymentProvider as never,
    );

    return { service, tx, orderRepository, timeline, inventory, notifications, paymentProvider };
}

describe("order lifecycle", () => {
    beforeEach(() => vi.clearAllMocks());

    it("resolves the required cancellation dependency registered by OrdersModule", async () => {
        const fixture = buildService();
        const providers = Reflect.getMetadata("providers", OrdersModule);
        expect(providers).toContain(NestOrdersCancellationService);
        const moduleRef = await Test.createTestingModule({ providers: [
            ...providers.filter((provider) => provider !== OrdersRepository && provider !== NestOrderTimelineService)
                .map((provider) => provider === NestOrdersService || provider === NestOrdersCancellationService
                    ? provider : { provide: provider, useValue: {} }),
            { provide: OrdersRepository, useValue: fixture.orderRepository },
            { provide: NestOrderTimelineService, useValue: fixture.timeline },
            { provide: NestInventoryService, useValue: fixture.inventory },
            { provide: NestNotificationsService, useValue: fixture.notifications },
        ] }).useMocker(() => ({})).compile();
        try {
            await expect(moduleRef.get(NestOrdersService).cancelOrder(9, "user-1")).resolves.toMatchObject({ status: 2 });
            expect(fixture.notifications.notifyOrderStatus).toHaveBeenCalledOnce();
        } finally {
            await moduleRef.close();
        }
    });

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

    it("locks unique products once in ID order and keeps duplicate item stock and alert transitions sequential", async () => {
        const alerts = { recordTransitionsInTransaction: vi.fn().mockResolvedValue(undefined) };
        const { service, tx, inventory } = buildService({
            items: [{ product_id: 4, quantity: 2 }, { product_id: 4, quantity: 3 }],
            productRows: [{ id: 4, price: 100, sale_price: null, stock: 0 }],
            alerts,
        });

        await service.cancelOrder(9, "user-1");

        expect(tx.query).toHaveBeenCalledWith(
            "SELECT id, price, sale_price, stock FROM products WHERE id IN (?) ORDER BY id FOR UPDATE",
            [4],
        );
        expect(tx.query.mock.calls.filter(([sql]) => String(sql).includes("FROM products") && String(sql).includes("FOR UPDATE"))).toHaveLength(1);
        expect(tx.query.mock.calls.filter(([sql]) => String(sql).startsWith("UPDATE products"))).toEqual([
            ["UPDATE products SET stock = stock + ? WHERE id = ?", [2, 4]],
            ["UPDATE products SET stock = stock + ? WHERE id = ?", [3, 4]],
        ]);
        expect(inventory.createMovementsInTransaction).toHaveBeenCalledWith(tx, [
            expect.objectContaining({ productId: 4, stockBefore: 0, stockAfter: 2 }),
            expect.objectContaining({ productId: 4, stockBefore: 2, stockAfter: 5 }),
        ]);
        expect(alerts.recordTransitionsInTransaction.mock.calls).toEqual([
            [tx, [expect.objectContaining({ previousStock: 0, currentStock: 2 })]],
        ]);
    });

    it("rejects a deleted order product before attempting any stock writes", async () => {
        const { service, tx, inventory, notifications } = buildService({ productRows: [] });

        await expect(service.cancelOrder(9, "user-1")).rejects.toMatchObject({ statusCode: 409 });

        expect(tx.query.mock.calls.some(([sql]) => String(sql).startsWith("UPDATE products"))).toBe(false);
        expect(inventory.createMovementsInTransaction).not.toHaveBeenCalled();
        expect(notifications.notifyOrderStatus).not.toHaveBeenCalled();
    });

    it("rejects an unchecked stock restore before recording movements or cancellation", async () => {
        const { service, tx, inventory, timeline, notifications } = buildService({ productStockAffectedRows: 0 });

        await expect(service.cancelOrder(9, "user-1")).rejects.toMatchObject({ statusCode: 409 });

        expect(tx.query.mock.calls.some(([sql]) => String(sql).startsWith("UPDATE orders"))).toBe(false);
        expect(inventory.createMovementsInTransaction).not.toHaveBeenCalled();
        expect(timeline.createTimelineEventInTransaction).not.toHaveBeenCalled();
        expect(notifications.notifyOrderStatus).not.toHaveBeenCalled();
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

    it("rejects nonowners and guests before any cancellation writes", async () => {
        for (const userId of ["user-1", null]) {
            const { service, tx, notifications } = buildService({ userId });
            await expect(service.cancelOrder(9, "attacker")).rejects.toMatchObject({ statusCode: 403 });
            expect(tx.query.mock.calls.some(([sql]) => sql.trimStart().startsWith("UPDATE"))).toBe(false);
            expect(notifications.notifyOrderStatus).not.toHaveBeenCalled();
        }
    });

    it("does not restore stock a second time when restoration was already recorded", async () => {
        const { service, tx, inventory } = buildService({ restoredAt: new Date() });
        await service.cancelOrder(9, "user-1");
        expect(tx.query.mock.calls.some(([sql]) => sql.includes("FROM products"))).toBe(false);
        expect(inventory.createMovementsInTransaction).not.toHaveBeenCalled();
    });

    it.each(["inventory", "timeline"])("propagates %s failure and suppresses post-commit notification", async (collaborator) => {
        const fixture = buildService();
        const failure = new Error("audit failed");
        if (collaborator === "inventory") fixture.inventory.createMovementsInTransaction.mockRejectedValueOnce(failure);
        else fixture.timeline.createTimelineEventInTransaction.mockRejectedValueOnce(failure);
        await expect(fixture.service.cancelOrder(9, "user-1")).rejects.toBe(failure);
        expect(fixture.notifications.notifyOrderStatus).not.toHaveBeenCalled();
    });

    it("waits for the transaction commit before notifying and loading a summary", async () => {
        const { service, tx, notifications, orderRepository } = buildService();
        let commit: () => void;
        const committed = new Promise<void>((resolve) => { commit = resolve; });
        const worked = Promise.withResolvers<void>();
        withTransaction.mockImplementation(async (work) => {
            const result = await work(tx);
            worked.resolve();
            await committed;
            return result;
        });
        const pending = service.cancelOrder(9, "user-1");
        await worked.promise;
        expect(notifications.notifyOrderStatus).not.toHaveBeenCalled();
        expect(orderRepository.getOrderById).not.toHaveBeenCalled();
        commit();
        await pending;
        expect(notifications.notifyOrderStatus).toHaveBeenCalledOnce();
    });

    it("rejects simulated paid PayOS delivery", async () => {
        const { service, timeline } = buildService({ paymentProvider: "payos", paymentStatus: "paid", simulated: true });
        await expect(service.changeOrderStatus(9, 1, "admin")).rejects.toMatchObject({ statusCode: 409 });
        expect(timeline.createTimelineEventInTransaction).not.toHaveBeenCalled();
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
