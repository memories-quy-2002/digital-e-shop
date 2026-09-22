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

describe("order cancellation product alerts", () => {
    beforeEach(() => vi.clearAllMocks());

    it("records back-in-stock from the locked stock before/after cancellation values", async () => {
        const tx = { query: vi.fn() };
        tx.query.mockImplementation(async (sql: string) => {
            if (sql.includes("SELECT user_id, status, inventory_restored_at")) {
                return [{ user_id: "user-1", status: 0, inventory_restored_at: null }];
            }
            if (sql.includes("FROM order_items")) return [{ product_id: 4, quantity: 2 }];
            if (sql.includes("FROM products")) return [{ id: 4, price: 100, sale_price: null, stock: 0 }];
            return { affectedRows: 1 };
        });
        withTransaction.mockImplementation(async (work: (transaction: typeof tx) => Promise<unknown>) => work(tx));

        const repository = {
            getOrderById: vi.fn((_id: number, callback: (error: null, rows: unknown[]) => void) => callback(null, [{ id: 9, status: 2 }])),
        };
        const timeline = { createTimelineEventInTransaction: vi.fn().mockResolvedValue(undefined) };
        const inventory = { createMovementsInTransaction: vi.fn().mockResolvedValue(undefined) };
        const notifications = { notifyOrderStatus: vi.fn() };
        const alerts = { recordTransitionsInTransaction: vi.fn().mockResolvedValue(undefined) };
        const service = new NestOrdersService(
            repository as never,
            timeline as never,
            {} as never,
            inventory as never,
            notifications as never,
            {} as never,
            {} as never,
            {} as never,
            undefined,
            alerts as never,
        );

        await service.cancelOrder(9, "user-1");

        expect(alerts.recordTransitionsInTransaction).toHaveBeenCalledWith(
            tx,
            [expect.objectContaining({
                type: "back_in_stock",
                productId: 4,
                previousStock: 0,
                currentStock: 2,
            })],
        );
    });
});
