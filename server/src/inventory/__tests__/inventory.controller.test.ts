import { PATH_METADATA } from "@nestjs/common/constants";
import { describe, expect, it } from "vitest";
import { ROLES_KEY } from "../../guards/roles.guard";
import { InventoryController } from "../inventory.controller";

describe("InventoryController routing and authorization", () => {
    it("requires the Admin role", () => {
        expect(Reflect.getMetadata(ROLES_KEY, InventoryController)).toEqual(["Admin"]);
    });

    it("keeps the legacy admin inventory route as an alias", () => {
        expect(Reflect.getMetadata(PATH_METADATA, InventoryController)).toEqual([
            "inventory-movements",
            "products/admin/inventory-movements",
        ]);
    });
});
