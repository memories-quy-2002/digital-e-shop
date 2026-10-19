import { z } from "zod";
import type { DeliveryStatus } from "./delivery-assignment.repository";

const localDateTime = z.string().regex(/^[1-9]\d{3}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Use a local date and time in YYYY-MM-DDTHH:mm format");

export function parseVietnamLocalDateTime(value: string): Date {
    const [date, time] = value.split("T");
    const [year, month, day] = date.split("-").map(Number);
    const [hour, minute] = time.split(":").map(Number);
    const local = new Date(Date.UTC(year, month - 1, day, hour, minute));
    if (local.getUTCFullYear() !== year || local.getUTCMonth() !== month - 1 || local.getUTCDate() !== day
        || local.getUTCHours() !== hour || local.getUTCMinutes() !== minute) {
        throw new Error("Invalid local date and time");
    }
    return new Date(local.getTime() - 7 * 60 * 60 * 1000);
}

const vietnamDateTime = localDateTime.transform((value, context) => {
    try {
        return parseVietnamLocalDateTime(value);
    } catch {
        context.addIssue({ code: "custom", message: "Invalid Vietnam local date and time" });
        return z.NEVER;
    }
});

export const deliveryAssignmentSchema = z.object({
    employeeId: z.string().trim().min(1).max(255),
    scheduledStartAt: vietnamDateTime,
    scheduledEndAt: vietnamDateTime,
}).superRefine((value, context) => {
    if (value.scheduledEndAt <= value.scheduledStartAt) {
        context.addIssue({ code: "custom", path: ["scheduledEndAt"], message: "Schedule end must be after schedule start" });
    }
});

const deliveryStatusSchema = z.enum(["OUT_FOR_DELIVERY", "DELIVERED", "DELIVERY_FAILED"]);

export const deliveryStatusUpdateSchema = z.object({
    status: deliveryStatusSchema,
    failureReason: z.string().trim().min(3).max(500).optional(),
}).superRefine((value, context) => {
    if (value.status === "DELIVERY_FAILED" && !value.failureReason) {
        context.addIssue({ code: "custom", path: ["failureReason"], message: "A reason is required when delivery fails" });
    }
    if (value.status !== "DELIVERY_FAILED" && value.failureReason) {
        context.addIssue({ code: "custom", path: ["failureReason"], message: "A failure reason is only valid for a failed delivery" });
    }
});

export type DeliveryAssignmentInput = z.infer<typeof deliveryAssignmentSchema>;
export type DeliveryStatusUpdate = z.infer<typeof deliveryStatusUpdateSchema> & { status: Exclude<DeliveryStatus, "ASSIGNED"> };
