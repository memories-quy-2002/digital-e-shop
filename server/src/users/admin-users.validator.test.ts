import { describe, expect, it } from "vitest";
import { adminUsersQuerySchema, adminUserUpdateSchema } from "./users.validator";

describe("admin user validation", () => {
    it("bounds account list queries and validates supported account filters", () => {
        expect(adminUsersQuerySchema.parse({ page: "2", role: "Admin", status: "Suspended" })).toEqual({
            page: 2,
            limit: 25,
            search: "",
            role: "Admin",
            status: "Suspended",
        });
        expect(adminUsersQuerySchema.safeParse({ page: 1_000_001 }).success).toBe(false);
        expect(adminUsersQuerySchema.safeParse({ limit: "500" }).success).toBe(false);
        expect(adminUsersQuerySchema.safeParse({ role: "owner" }).success).toBe(false);
        expect(adminUsersQuerySchema.safeParse({ role: "DeliveryStaff" }).success).toBe(true);
    });

    it("requires a reason for privilege or account-status changes", () => {
        expect(adminUserUpdateSchema.safeParse({ role: "Admin", status: "Active" }).success).toBe(false);
        expect(adminUserUpdateSchema.safeParse({ role: "Admin", status: "Active", reason: "  Promotion approved  " })).toMatchObject({
            success: true,
            data: { reason: "Promotion approved" },
        });
        expect(adminUserUpdateSchema.safeParse({ role: "DeliveryStaff", status: "Active", reason: "Delivery team assignment" }).success).toBe(true);
    });
});
