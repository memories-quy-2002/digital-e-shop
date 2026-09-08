import { describe, expect, it, vi } from "vitest";

const poolQuery = vi.hoisted(() => vi.fn());

vi.mock("#src/config/database.config", () => ({
    default: { query: poolQuery },
}));

import { OrdersRepository } from "../orders.repository";
import { CheckoutReservationRepository } from "../checkout-reservation.repository";

describe("pending checkout repositories", () => {
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
});
