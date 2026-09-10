import { describe, expect, it, vi } from "vitest";

const poolQuery = vi.hoisted(() => vi.fn());

vi.mock("#src/config/database.config", () => ({
    default: { query: poolQuery },
}));

import { OrdersRepository } from "../orders.repository";
import { CheckoutReservationRepository } from "../checkout-reservation.repository";

describe("pending checkout repositories", () => {
    it("selects guest contact fields for admin order summaries without token material", () => {
        poolQuery.mockClear();
        const repository = new OrdersRepository({} as never);
        const callback = vi.fn();

        repository.getOrders(callback);

        const [queryConfig] = poolQuery.mock.calls[0];
        expect(queryConfig.sql).toContain("o.guest_email");
        expect(queryConfig.sql).toContain("o.guest_name");
        expect(queryConfig.sql).toContain("o.guest_phone");
        expect(queryConfig.sql).toContain("LEFT JOIN users u");
        expect(queryConfig.sql).not.toContain("guest_order_token_hash");
    });

    it("loads guest identity by order ID without exposing another user's order", () => {
        const repository = new OrdersRepository({} as never);
        const callback = vi.fn();

        repository.getGuestOrderIdentity(91, callback);

        const [queryConfig, queryParams, queryCallback] = poolQuery.mock.calls[0];
        expect(queryConfig.sql).toContain("user_id IS NULL");
        expect(queryConfig.sql).toContain("guest_order_token_hash");
        expect(queryParams).toEqual([91]);
        expect(queryCallback).toBe(callback);
    });

    it("selects every guest identity field when loading a pending checkout by session", () => {
        const repository = new OrdersRepository({} as never);
        const callback = vi.fn();

        repository.getPendingCheckoutBySessionId("cs_guest_123", callback);

        const [queryConfig, queryParams, queryCallback] = poolQuery.mock.calls[0];
        expect(queryConfig.sql).toContain("guest_email");
        expect(queryConfig.sql).toContain("guest_name");
        expect(queryConfig.sql).toContain("guest_phone");
        expect(queryConfig.sql).toContain("guest_order_token_hash");
        expect(queryParams).toEqual(["cs_guest_123"]);
        expect(queryCallback).toBe(callback);
    });

    it("rejects a raw guest token before it reaches pending checkout persistence", async () => {
        const query = vi.fn();
        const repository = new CheckoutReservationRepository();

        await expect(repository.insertPendingCheckout({ query } as never, {
            reservationToken: "reservation-token",
            userId: null,
            guestEmail: "guest@example.com",
            guestName: "Guest Buyer",
            guestPhone: null,
            guestOrderTokenHash: "raw-guest-token",
            cartJson: "[]",
            totalPrice: 10,
            discount: 0,
            shippingAddress: "1 Test Street",
            expiresAt: new Date("2099-01-01T00:00:00.000Z"),
        })).rejects.toThrow("Guest order token hash");

        expect(query).not.toHaveBeenCalled();
    });

    it("locks the complete transactional guest purchase product snapshot", async () => {
        const query = vi.fn().mockResolvedValue([]);
        const repository = new CheckoutReservationRepository();

        await repository.lockProductsForPurchase({ query } as never, [7, 9]);

        expect(query).toHaveBeenCalledWith(
            expect.stringContaining("p.price, p.sale_price, p.stock"),
            [7, 9],
        );
        expect(query.mock.calls[0][0]).toContain("FOR UPDATE");
        expect(query.mock.calls[0][0]).toContain("p.stock >= 0");
    });
});
