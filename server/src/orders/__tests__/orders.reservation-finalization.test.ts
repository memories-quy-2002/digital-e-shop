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
    const productAttributesRepository = { getForProducts: vi.fn().mockResolvedValue(new Map()) };
    const timelineService = { recordTimelineEvent: vi.fn(), createTimelineEventInTransaction: vi.fn().mockResolvedValue(undefined) };
    const notificationsService = { notifyOrderPlaced: vi.fn() };
    const emailService = { sendOrderConfirmation: vi.fn().mockResolvedValue(undefined) };
    const usersRepository = { findById: vi.fn().mockResolvedValue({ id: "user-1", email: "customer@example.com", username: "Customer" }) };

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
        productAttributesRepository as never,
        undefined,
        emailService as never,
        usersRepository as never,
    );
    return { service, tx, reservationRepository, inventoryService, timelineService, notificationsService, productAttributesRepository, emailService, usersRepository };
}

describe("reserved checkout finalization", () => {
    beforeEach(() => vi.clearAllMocks());

    it("creates the order, guards stock, records movements, and consumes the reservation in one transaction", async () => {
        const { service, tx, reservationRepository, inventoryService, timelineService, notificationsService, emailService } = buildService();

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
        expect(timelineService.createTimelineEventInTransaction).toHaveBeenCalledWith(tx, {
            orderId: 42,
            status: 0,
            note: "Order was placed by the customer.",
            actorId: "user-1",
        });
        expect(notificationsService.notifyOrderPlaced).toHaveBeenCalledWith("user-1", 42, 18);
        expect(emailService.sendOrderConfirmation).toHaveBeenCalledWith(expect.objectContaining({
            customerType: "authenticated",
            orderId: 42,
            email: "customer@example.com",
            emailVerified: true,
        }));
    });

    it("passes an unverified account state to the order email boundary", async () => {
        const { service, emailService, usersRepository } = buildService();
        usersRepository.findById.mockResolvedValue({
            id: "user-1",
            email: "customer@example.com",
            username: "Customer",
            email_verified_at: null,
        });

        await service.finalizeReservedCheckout("cs_123", "pi_123");

        expect(emailService.sendOrderConfirmation).toHaveBeenCalledWith(expect.objectContaining({
            customerType: "authenticated",
            email: "customer@example.com",
            emailVerified: false,
        }));
    });

    it("uses current structured product attributes in the order snapshot", async () => {
        const { service, tx, productAttributesRepository } = buildService();
        productAttributesRepository.getForProducts.mockResolvedValue(new Map([
            [4, [{ key: "socket", label: "Socket", type: "text", textValue: "AM5", filterable: true }]],
        ]));

        await service.finalizeReservedCheckout("cs_123", "pi_123");

        const orderItemsCall = tx.query.mock.calls.find(([sql]) => String(sql).includes("INSERT INTO order_items"));
        expect(orderItemsCall?.[1]?.[0]?.[0]?.[11]).toBe(JSON.stringify({
            socket: { label: "Socket", type: "text", value: "AM5", filterable: true },
        }));
    });

    it("returns an already-created order without decrementing stock or sending side effects twice", async () => {
        const { service, tx, reservationRepository, inventoryService, timelineService, notificationsService, emailService } = buildService("CONSUMED");
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
        expect(timelineService.createTimelineEventInTransaction).not.toHaveBeenCalled();
        expect(notificationsService.notifyOrderPlaced).not.toHaveBeenCalled();
        expect(emailService.sendOrderConfirmation).not.toHaveBeenCalled();
    });

    it("finalizes a guest reservation with its contact snapshot and does not touch a user cart", async () => {
        const { service, tx, reservationRepository, notificationsService, emailService } = buildService();
        vi.mocked(reservationRepository.getPendingCheckoutForUpdate).mockResolvedValue({
            id: 7,
            stripe_session_id: "cs_guest",
            reservation_token: "reservation-token",
            user_id: null,
            guest_email: "buyer@example.com",
            guest_name: "Buyer Name",
            guest_phone: "+84123456789",
            guest_order_token_hash: "a".repeat(64),
            cart_json: JSON.stringify([{ product_id: 4, quantity: 2, price: 10, product_name: "Widget" }]),
            total_price: "20.00",
            discount: "2.00",
            shipping_address: "123 Main St",
            status: "PENDING",
            expires_at: "2099-09-06T01:30:00.000Z",
            created_at: "2026-09-06T01:00:00.000Z",
            consumed_at: null,
        });

        await service.finalizeReservedCheckout("cs_guest", "pi_guest");

        const orderInsert = tx.query.mock.calls.find(([sql]) => String(sql).includes("INSERT INTO orders"));
        expect(orderInsert?.[0]).toContain("guest_email");
        expect(orderInsert?.[1]).toEqual(expect.arrayContaining([
            null,
            "buyer@example.com",
            "Buyer Name",
            "+84123456789",
            "a".repeat(64),
        ]));
        expect(tx.query).not.toHaveBeenCalledWith(expect.stringContaining("UPDATE carts SET done"), expect.anything());
        expect(notificationsService.notifyOrderPlaced).not.toHaveBeenCalled();
        expect(emailService.sendOrderConfirmation).toHaveBeenCalledWith(expect.objectContaining({
            orderId: 42,
            email: "buyer@example.com",
            items: expect.any(Array),
        }));
        expect(JSON.stringify(emailService.sendOrderConfirmation.mock.calls[0][0])).not.toContain("a".repeat(64));
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

    it("rejects released reservations and returns null when the session is missing", async () => {
        const released = buildService("RELEASED");
        await expect(released.service.finalizeReservedCheckout("cs_123", "pi_123")).rejects.toMatchObject({ statusCode: 409 });

        const missing = buildService();
        vi.mocked(missing.reservationRepository.getPendingCheckoutForUpdate).mockResolvedValue(null);
        await expect(missing.service.finalizeReservedCheckout("cs_missing", "pi_missing")).resolves.toBeNull();
        expect(missing.reservationRepository.getReservationItems).not.toHaveBeenCalled();
    });
});
