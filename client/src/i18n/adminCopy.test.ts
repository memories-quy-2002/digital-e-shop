import { describe, expect, it } from "vitest";
import { translateAdminCopy } from "./adminCopy";
import { translateAdminDashboardCopy } from "./adminDashboardCopy";

describe("Admin copy translations", () => {
    it("translates shared Admin navigation, statuses, and form validation in Vietnamese", () => {
        expect(translateAdminCopy("vi", "Payment reconciliation")).toBe("Đối soát thanh toán");
        expect(translateAdminCopy("vi", "WAITING FOR CUSTOMER")).toBe("Chờ khách hàng");
        expect(translateAdminCopy("vi", "Inventory quantity must be a whole number.")).toBe("Số lượng tồn kho phải là số nguyên.");
    });

    it("keeps English copy intact and leaves unknown server text unchanged", () => {
        expect(translateAdminCopy("en", "Payment reconciliation")).toBe("Payment reconciliation");
        expect(translateAdminCopy("vi", "An unrecognized server message.")).toBe("An unrecognized server message.");
    });

    it("preserves the entered key while translating dynamic attribute validation", () => {
        expect(translateAdminCopy("vi", "Attribute gpu_model needs a label.")).toBe("Thuộc tính gpu_model cần có tên hiển thị.");
    });
});

describe("Admin dashboard copy translations", () => {
    it("translates shared shell and dashboard labels in Vietnamese", () => {
        expect(translateAdminDashboardCopy("vi", "Admin navigation panel")).toBe("Thanh điều hướng quản trị");
        expect(translateAdminDashboardCopy("vi", "Operations overview")).toBe("Tổng quan vận hành");
    });

    it("preserves English and unknown dynamic copy", () => {
        expect(translateAdminDashboardCopy("en", "Operations overview")).toBe("Operations overview");
        expect(translateAdminDashboardCopy("vi", "An unknown alert")).toBe("An unknown alert");
    });
});
