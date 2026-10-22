import { describe, expect, it } from "vitest";
import { translateAdminDashboardCopy } from "./adminDashboardCopy";

describe("translateAdminDashboardCopy", () => {
    it("translates dashboard priority labels and the dynamic revenue description", () => {
        expect(translateAdminDashboardCopy("vi", "High priority")).toBe("Ưu tiên cao");
        expect(translateAdminDashboardCopy("vi", "Medium priority")).toBe("Ưu tiên trung bình");
        expect(translateAdminDashboardCopy("vi", "Last 30 days")).toBe("30 ngày gần đây");
        expect(translateAdminDashboardCopy("vi", "after discounts")).toBe("sau giảm giá");
    });
});
