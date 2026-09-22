import { describe, expect, it, vi } from "vitest";
import { ProductAlertsController } from "../product-alerts.controller";
import { productAlertUpdateSchema } from "../product-alerts.validator";

describe("ProductAlertsController", () => {
    it("returns the list response envelope", async () => {
        const service = { getForUser: vi.fn().mockResolvedValue([{ productId: 42 }]) };
        const controller = new ProductAlertsController(service as never);

        await expect(controller.getAlerts("user-1")).resolves.toEqual({
            alerts: [{ productId: 42 }],
            msg: "Product alerts retrieved successfully",
        });
        expect(service.getForUser).toHaveBeenCalledWith("user-1");
    });

    it("returns the single alert response envelope", async () => {
        const service = { getForProduct: vi.fn().mockResolvedValue({ productId: 42 }) };
        const controller = new ProductAlertsController(service as never);

        await expect(controller.getAlert("user-1", "42")).resolves.toEqual({
            alert: { productId: 42 },
            msg: "Product alert retrieved successfully",
        });
        expect(service.getForProduct).toHaveBeenCalledWith("user-1", 42);
    });

    it("accepts boolean-only update bodies and returns { alert, msg }", async () => {
        const service = { updateForUser: vi.fn().mockResolvedValue({ productId: 42, priceDropEnabled: true }) };
        const controller = new ProductAlertsController(service as never);
        const body = { priceDropEnabled: true, backInStockEnabled: false };

        await expect(controller.updateAlert("user-1", "42", body)).resolves.toEqual({
            alert: { productId: 42, priceDropEnabled: true },
            msg: "Product alert preferences updated successfully",
        });
        expect(service.updateForUser).toHaveBeenCalledWith("user-1", 42, body);
        expect(productAlertUpdateSchema.safeParse(body).success).toBe(true);
        expect(productAlertUpdateSchema.safeParse({ ...body, extra: "nope" }).success).toBe(false);
    });
});
