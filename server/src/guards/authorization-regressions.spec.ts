import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { PATH_METADATA } from "@nestjs/common/constants";
import { ROLES_KEY } from "./roles.guard";
import { OrdersController } from "../orders/orders.controller";
import { PromotionsController } from "../promotions/promotions.controller";
import { InventoryController } from "../inventory/inventory.controller";

const rolesFor = (target: object) => Reflect.getMetadata(ROLES_KEY, target) as string[] | undefined;

describe("NestJS migration authorization contracts", () => {
    it.each([
        ["list orders", OrdersController.prototype.getOrders],
        ["list order item revenue", OrdersController.prototype.getOrderItems],
        ["change order status", OrdersController.prototype.changeOrderStatus],
    ])("keeps %s admin-only", (_name, handler) => {
        expect(rolesFor(handler)).toEqual(["admin"]);
    });

    it("keeps promotion management admin-only", () => {
        expect(rolesFor(PromotionsController)).toEqual(["admin"]);
    });

    it("keeps inventory movement reporting admin-only", () => {
        expect(rolesFor(InventoryController)).toEqual(["admin"]);
    });

    it("preserves the pre-migration inventory route used by the admin client", () => {
        expect(Reflect.getMetadata(PATH_METADATA, InventoryController)).toBe(
            "products/admin/inventory-movements",
        );
    });
});
