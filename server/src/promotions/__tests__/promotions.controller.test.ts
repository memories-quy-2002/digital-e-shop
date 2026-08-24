import { describe, expect, it } from "vitest";
import { ROLES_KEY } from "../../guards/roles.guard";
import { PromotionsController } from "../promotions.controller";

describe("PromotionsController authorization", () => {
    it("requires the Admin role for the controller", () => {
        expect(Reflect.getMetadata(ROLES_KEY, PromotionsController)).toEqual(["Admin"]);
    });
});
