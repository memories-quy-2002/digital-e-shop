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

function buildService(status: string = "PENDING") {
    const tx = { query: vi.fn() };
    const reservationRepository = {
        getPendingCheckoutForUpdate: vi.fn().mockResolvedValue({
            id: 7,
            stripe_session_id: "cs_123",
            reservation_token: "reservation-token",
            user_id: "user-1",
            cart_json: JSON.stringify([{ product_id: 4, quantity: 2, price: 10, product_name: "Widget" }]),
            total_price: "20.00",
            discount: "2.00",
            shipping_address: "123 Main St",
            status,
            expires_at: "2099-09-06T01:30:00.000Z",
            created_at: "2026-09-06T01:00:00.000Z",
            consumed_at: status === "CONSUMED" ? "2026-09-06T01:10:00.000Z" : null,
        }),
        getReservationItems: vi.fn().mockResolvedValue([{ productId: 4, quantity: 2 }]),
        lockProducts: vi.fn().mockResolvedValue([{ id: 4, name: "Widget", stock: 5 }]),
        consumeReservation: vi.fn().mockResolvedValue(1),
    };
    const inventoryService = { createMovementsInTransaction: vi.fn().mockResolvedValue(undefined) };
    const timelineService = { recordTimelineEvent: vi.fn() };
    const notificationsService = { notifyOrderPlaced: vi.fn() };

    tx.query.mockImplementation(async (sql: string) => {
        if (sql.includes("FROM orders WHERE stripe_checkout_session_id")) return [];
        if (sql.startsWith("INSERT INTO orders")) return { insertId: 42 };
        if (sql.startsWith("UPDATE products")) return { affectedRows: 1 };
        if (sql.includes("FROM orders WHERE id")) return [{ id: 42, date_added: "2026-09-06T01:00:00.000Z" }];
        return [];
    });
    withTransaction.mockImplementation(async (work: (transaction: typeof tx) => Promise<unknown>) => work(tx));

    const service = new NestOrdersService(
        {} as never,
        timelineService as never,
        {} as never,
        inventoryService as never,
        notificationsService as never,
        reservationRepository as never,
        { consumePromotionReservation: vi.fn() } as never,
    );
    return { service, tx, reservationRepository, inventoryService, timelineService, notificationsService };
}

describe("reserved checkout finalization", () => {
    beforeEach(() => vi.clearAllMocks());

    it("creates the order, guards stock, records movements, and consumes the reservation in one transaction", async () => {
        const { service, tx, reservationRepository, inventoryService, timelineService, notificationsService } = buildService();

        await expect(service.finalizeReservedCheckout("cs_123", "pi_123")).resolves.toEqual({
            id: 42,
            date_added: "2026-09-06T01:00:00.000Z",
        });

        expect(tx.query).toHaveBeenCalledWith(
            "UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?",
            [2, 4, 2],
        );
        expect(inventoryService.createMovementsInTransaction).toHaveBeenCalledWith(tx, [expect.objectContaining({
            productId: 4,
            quantityChange: -2,
            stockBefore: 5,
            stockAfter: 3,
        })]);
        expect(reservationRepository.consumeReservation).toHaveBeenCalledWith(tx, 7);
        expect(timelineService.recordTimelineEvent).toHaveBeenCalledOnce();
        expect(notificationsService.notifyOrderPlaced).toHaveBeenCalledWith("user-1", 42, 18);
    });

    it("returns an already-created order without decrementing stock or sending side effects twice", async () => {
        const { service, tx, reservationRepository, inventoryService, timelineService, notificationsService } = buildService("CONSUMED");
        tx.query.mockImplementation(async (sql: string) => {
            if (sql.includes("FROM orders WHERE stripe_checkout_session_id")) {
                return [{ id: 42, date_added: "2026-09-06T01:00:00.000Z" }];
            }
            return [];
        });

        await expect(service.finalizeReservedCheckout("cs_123", "pi_123")).resolves.toEqual({
            id: 42,
            date_added: "2026-09-06T01:00:00.000Z",
        });
        expect(tx.query).not.toHaveBeenCalledWith(expect.stringContaining("UPDATE products"), expect.anything());
        expect(reservationRepository.consumeReservation).not.toHaveBeenCalled();
        expect(inventoryService.createMovementsInTransaction).not.toHaveBeenCalled();
        expect(timelineService.recordTimelineEvent).not.toHaveBeenCalled();
        expect(notificationsService.notifyOrderPlaced).not.toHaveBeenCalled();
    });

    it("rejects a delayed completion after the database grace window", async () => {
        const { service, tx, reservationRepository } = buildService();
        vi.mocked(reservationRepository.getPendingCheckoutForUpdate).mockResolvedValue({
            id: 7,
            stripe_session_id: "cs_123",
            reservation_token: "reservation-token",
            user_id: "user-1",
            cart_json: "[]",
            total_price: "20.00",
            discount: "0.00",
            shipping_address: "123 Main St",
            status: "PENDING",
            expires_at: "2020-01-01T00:00:00.000Z",
            created_at: "2020-01-01T00:00:00.000Z",
            consumed_at: null,
        });
        tx.query.mockImplementation(async (sql: string) => {
            if (sql.includes("FROM orders WHERE stripe_checkout_session_id")) return [];
            return [];
        });

        await expect(service.finalizeReservedCheckout("cs_123", "pi_123")).rejects.toMatchObject({ statusCode: 409 });
        expect(reservationRepository.getReservationItems).not.toHaveBeenCalled();
    });
});
