import { describe, expect, it } from "vitest";
import { ShippingController } from "../shipping.controller";
import { AdminShippingController } from "../admin-shipping.controller";
import { ShippingModule } from "../shipping.module";

describe("retired carrier runtime boundary", () => {
    it("does not expose carrier location, service, label, return, create, or webhook routes", () => {
        for (const method of ["provinces", "candidates", "wards", "services"]) {
            expect(ShippingController.prototype).not.toHaveProperty(method);
        }
        for (const method of ["create", "label", "returned"]) {
            expect(AdminShippingController.prototype).not.toHaveProperty(method);
        }
        const controllers = Reflect.getMetadata("controllers", ShippingModule) as Array<{ name: string }>;
        expect(controllers.map((controller) => controller.name)).not.toContain("ShippingWebhookController");
    });
});
