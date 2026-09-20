import type { AfterSalesKind, AfterSalesOrderContext, AfterSalesStatus, EligibilityResult } from "./after-sales.types";

const RETURN_WINDOW_DAYS = 7;

const parseDate = (value: string | Date): Date => {
    const parsed = value instanceof Date ? new Date(value.getTime()) : new Date(value);
    if (Number.isNaN(parsed.getTime())) throw new Error("Invalid after-sales date");
    return parsed;
};

const addUtcDays = (value: Date, days: number): Date => {
    const result = new Date(value.getTime());
    result.setUTCDate(result.getUTCDate() + days);
    return result;
};

const addUtcMonths = (value: Date, months: number): Date => {
    const result = new Date(value.getTime());
    const day = result.getUTCDate();
    result.setUTCDate(1);
    result.setUTCMonth(result.getUTCMonth() + months);
    const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
    result.setUTCDate(Math.min(day, lastDay));
    return result;
};

export function evaluateEligibility(
    input: AfterSalesOrderContext & { kind: AfterSalesKind; now?: string | Date },
): EligibilityResult {
    if (input.orderStatus !== 1) {
        return { eligible: false, code: "ORDER_NOT_ELIGIBLE", message: "Only delivered orders are eligible for after-sales requests." };
    }
    if (!input.deliveredAt) {
        return { eligible: false, code: "ORDER_NOT_DELIVERED", message: "The order does not have a delivery date yet." };
    }

    const deliveredAt = parseDate(input.deliveredAt);
    const now = parseDate(input.now || new Date());
    const eligibleUntil = input.kind === "RETURN"
        ? addUtcDays(deliveredAt, RETURN_WINDOW_DAYS)
        : input.warrantyMonths && input.warrantyMonths > 0
            ? addUtcMonths(deliveredAt, input.warrantyMonths)
            : null;

    if (!eligibleUntil) {
        return { eligible: false, code: "WARRANTY_NOT_ACTIVE", message: "This item is not covered by an active warranty." };
    }
    if (now.getTime() > eligibleUntil.getTime()) {
        return {
            eligible: false,
            code: input.kind === "RETURN" ? "RETURN_WINDOW_EXPIRED" : "WARRANTY_NOT_ACTIVE",
            message: input.kind === "RETURN" ? "The seven-day return window has expired." : "The item warranty period has expired.",
            eligibleUntil: eligibleUntil.toISOString(),
        };
    }
    return { eligible: true, eligibleUntil: eligibleUntil.toISOString() };
}

const transitions: Record<AfterSalesStatus, readonly AfterSalesStatus[]> = {
    REQUESTED: ["APPROVED", "REJECTED"],
    APPROVED: ["RECEIVED", "REJECTED"],
    REJECTED: [],
    RECEIVED: ["REFUND_PENDING", "CLOSED"],
    REFUND_PENDING: ["REFUNDED"],
    REFUNDED: ["CLOSED"],
    CLOSED: [],
};

export function assertTransition(from: AfterSalesStatus, to: AfterSalesStatus): void {
    if (!transitions[from]?.includes(to)) {
        throw Object.assign(new Error(`Invalid after-sales status transition: ${from} -> ${to}`), { statusCode: 409, code: "INVALID_TRANSITION" });
    }
}

export function isActiveRequestStatus(status: AfterSalesStatus): boolean {
    return !["REJECTED", "CLOSED"].includes(status);
}

export const AFTER_SALES_RETURN_WINDOW_DAYS = RETURN_WINDOW_DAYS;
