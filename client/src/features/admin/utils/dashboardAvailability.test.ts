import { describe, expect, it } from "vitest";
import {
    displayDashboardValue,
    getDashboardUpdateLabel,
    type DashboardAvailability,
} from "./dashboardAvailability";

describe("dashboard availability", () => {
    it("keeps a successful zero visible", () => {
        expect(displayDashboardValue("success", 0)).toBe(0);
    });

    it("marks a failed value as unavailable", () => {
        expect(displayDashboardValue("error", 0)).toBe("Unavailable");
    });

    it("classifies mixed section results as partially updated", () => {
        const availability: DashboardAvailability = {
            analytics: "success",
            products: "success",
            orders: "error",
            users: "success",
            orderItems: "success",
        };

        expect(getDashboardUpdateLabel(availability)).toBe("Partially updated");
    });
});
