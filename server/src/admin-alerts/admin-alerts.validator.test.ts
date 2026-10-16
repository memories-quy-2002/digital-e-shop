import { describe, expect, it } from "vitest";
import { acknowledgeAdminAlertsSchema, updateAdminAlertTriageSchema } from "./admin-alerts.validator";

describe("acknowledgeAdminAlertsSchema", () => {
    it("bounds and de-duplicates acknowledgement IDs", () => {
        expect(acknowledgeAdminAlertsSchema.parse({ alertIds: ["order-12", "order-12", "inventory-9"] })).toEqual({
            alertIds: ["order-12", "inventory-9"],
        });
        expect(acknowledgeAdminAlertsSchema.safeParse({ alertIds: ["unknown-3"] }).success).toBe(false);
        expect(acknowledgeAdminAlertsSchema.safeParse({ alertIds: Array.from({ length: 101 }, (_, index) => `order-${index}`) }).success).toBe(false);
    });
});

describe("updateAdminAlertTriageSchema", () => {
    it("accepts supported triage actions for active alert IDs", () => {
        expect(updateAdminAlertTriageSchema.parse({ alertId: "order-42", action: "claim" })).toEqual({
            alertId: "order-42",
            action: "claim",
        });
    });

    it("rejects unsupported actions and malformed alert IDs", () => {
        expect(updateAdminAlertTriageSchema.safeParse({ alertId: "unknown-42", action: "claim" }).success).toBe(false);
        expect(updateAdminAlertTriageSchema.safeParse({ alertId: "order-42", action: "assign-to-anyone" }).success).toBe(false);
    });

    it("accepts versioned alert IDs so a later incident does not inherit old read state", () => {
        expect(updateAdminAlertTriageSchema.parse({ alertId: "inventory-42-20261016120000000000", action: "claim" }).alertId)
            .toBe("inventory-42-20261016120000000000");
    });
});
