import { describe, expect, it, vi } from "vitest";
import { CustomerShippingController } from "../customer-shipping.controller";

describe("customer shipping guest capability route", () => {
    it("maps an invalid guest capability to a generic not-found response", async () => {
        const orders = { lookupGuestOrder: vi.fn().mockRejectedValue(Object.assign(new Error("Order not found"), { statusCode: 404 })) };
        const fulfillment = { summary: vi.fn() };
        const controller = new CustomerShippingController(orders as never, fulfillment as never);

        await expect(controller.guest({ orderId: 42, guestOrderToken: "synthetic-token" }))
            .rejects.toMatchObject({ status: 404, message: "Order not found" });
        expect(fulfillment.summary).not.toHaveBeenCalled();
    });
});
