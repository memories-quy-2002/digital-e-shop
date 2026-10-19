import { describe, expect, it } from "vitest";
import { deliveryAssignmentSchema, deliveryStatusUpdateSchema, parseVietnamLocalDateTime } from "./delivery.validator";

describe("delivery request validation", () => {
    it("interprets schedule input as Vietnam local time and requires an increasing interval", () => {
        const parsed = deliveryAssignmentSchema.parse({ employeeId: "driver-1", scheduledStartAt: "2026-10-17T09:00", scheduledEndAt: "2026-10-17T10:30" });
        expect(parsed.scheduledStartAt).toEqual(new Date("2026-10-17T02:00:00.000Z"));
        expect(parsed.scheduledEndAt).toEqual(new Date("2026-10-17T03:30:00.000Z"));
        expect(() => parseVietnamLocalDateTime("2026-02-30T09:00")).toThrow();
        expect(deliveryAssignmentSchema.safeParse({ employeeId: "driver-1", scheduledStartAt: "2026-10-17T10:00", scheduledEndAt: "2026-10-17T09:00" }).success).toBe(false);
    });

    it("requires a failure reason and rejects status values outside the staff workflow", () => {
        expect(deliveryStatusUpdateSchema.safeParse({ status: "DELIVERY_FAILED" }).success).toBe(false);
        expect(deliveryStatusUpdateSchema.parse({ status: "DELIVERY_FAILED", failureReason: "Customer unavailable" }).failureReason).toBe("Customer unavailable");
        expect(deliveryStatusUpdateSchema.safeParse({ status: "ASSIGNED" }).success).toBe(false);
    });
});
