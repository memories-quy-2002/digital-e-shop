import { describe, expect, it, vi } from "vitest";
import { CustomerShippingController } from "../customer-shipping.controller";

describe("customer shipping guest capability route", () => {
    it("maps an invalid guest capability to a generic not-found response", async () => {
        const orders = { lookupGuestOrder: vi.fn().mockRejectedValue(Object.assign(new Error("Order not found"), { statusCode: 404 })) };
        const fulfillment = { summary: vi.fn() };
        const assignments = { customerSummary: vi.fn() };
        const controller = new CustomerShippingController(orders as never, fulfillment as never, assignments as never);

        await expect(controller.guest({ orderId: 42, guestOrderToken: "synthetic-token" }))
            .rejects.toMatchObject({ status: 404, message: "Order not found" });
        expect(fulfillment.summary).not.toHaveBeenCalled();
    });

    it("returns assignment status only after validating the guest capability", async () => {
        const orders = { lookupGuestOrder: vi.fn().mockResolvedValue({ id: 42 }) };
        const fulfillment = { summary: vi.fn().mockResolvedValue({ state: "READY_TO_SHIP" }) };
        const assignments = { customerSummary: vi.fn().mockResolvedValue({ status: "ASSIGNED", employeeName: "Driver One" }) };
        const controller = new CustomerShippingController(orders as never, fulfillment as never, assignments as never);

        await expect(controller.guest({ orderId: 42, guestOrderToken: "valid-hashed-capability" }))
            .resolves.toEqual({ shipment: { state: "READY_TO_SHIP" }, delivery: { status: "ASSIGNED", employeeName: "Driver One" } });
        expect(assignments.customerSummary).toHaveBeenCalledWith(42);
    });
});
