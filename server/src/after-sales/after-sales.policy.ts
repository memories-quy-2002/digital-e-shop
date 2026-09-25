import { AFTER_SALES_ERROR_CODE, AFTER_SALES_KIND, AFTER_SALES_STATUS, type AfterSalesKind, type AfterSalesOrderContext, type AfterSalesStatus, type EligibilityResult } from "./after-sales.types";
import { HTTP_STATUS } from "#src/shared/constants/http-status";
import { ORDER_STATUS } from "#src/shared/constants/order-status";
import { AFTER_SALES_RETURN_WINDOW_DAYS } from "./after-sales.constants";

export { AFTER_SALES_RETURN_WINDOW_DAYS } from "./after-sales.constants";

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
    if (input.orderStatus !== ORDER_STATUS.DONE) {
        return { eligible: false, code: AFTER_SALES_ERROR_CODE.ORDER_NOT_ELIGIBLE, message: "Only delivered orders are eligible for after-sales requests." };
    }
    if (!input.deliveredAt) {
        return { eligible: false, code: AFTER_SALES_ERROR_CODE.ORDER_NOT_DELIVERED, message: "The order does not have a delivery date yet." };
    }

    const deliveredAt = parseDate(input.deliveredAt);
    const now = parseDate(input.now || new Date());
    const eligibleUntil = input.kind === AFTER_SALES_KIND.RETURN
        ? addUtcDays(deliveredAt, AFTER_SALES_RETURN_WINDOW_DAYS)
        : input.warrantyMonths && input.warrantyMonths > 0
            ? addUtcMonths(deliveredAt, input.warrantyMonths)
            : null;

    if (!eligibleUntil) {
        return { eligible: false, code: AFTER_SALES_ERROR_CODE.WARRANTY_NOT_ACTIVE, message: "This item is not covered by an active warranty." };
    }
    if (now.getTime() > eligibleUntil.getTime()) {
        return {
            eligible: false,
            code: input.kind === AFTER_SALES_KIND.RETURN ? AFTER_SALES_ERROR_CODE.RETURN_WINDOW_EXPIRED : AFTER_SALES_ERROR_CODE.WARRANTY_NOT_ACTIVE,
            message: input.kind === AFTER_SALES_KIND.RETURN ? "The seven-day return window has expired." : "The item warranty period has expired.",
            eligibleUntil: eligibleUntil.toISOString(),
        };
    }
    return { eligible: true, eligibleUntil: eligibleUntil.toISOString() };
}

const transitions: Record<AfterSalesStatus, readonly AfterSalesStatus[]> = {
    [AFTER_SALES_STATUS.REQUESTED]: [AFTER_SALES_STATUS.APPROVED, AFTER_SALES_STATUS.REJECTED],
    [AFTER_SALES_STATUS.APPROVED]: [AFTER_SALES_STATUS.RECEIVED, AFTER_SALES_STATUS.REJECTED],
    [AFTER_SALES_STATUS.REJECTED]: [],
    [AFTER_SALES_STATUS.RECEIVED]: [AFTER_SALES_STATUS.REFUND_PENDING, AFTER_SALES_STATUS.CLOSED],
    [AFTER_SALES_STATUS.REFUND_PENDING]: [AFTER_SALES_STATUS.REFUNDED],
    [AFTER_SALES_STATUS.REFUNDED]: [AFTER_SALES_STATUS.CLOSED],
    [AFTER_SALES_STATUS.CLOSED]: [],
};

export function assertTransition(from: AfterSalesStatus, to: AfterSalesStatus): void {
    if (!transitions[from]?.includes(to)) {
        throw Object.assign(new Error(`Invalid after-sales status transition: ${from} -> ${to}`), { statusCode: HTTP_STATUS.CONFLICT, code: AFTER_SALES_ERROR_CODE.INVALID_TRANSITION });
    }
}

export function isActiveRequestStatus(status: AfterSalesStatus): boolean {
    return status !== AFTER_SALES_STATUS.REJECTED && status !== AFTER_SALES_STATUS.CLOSED;
}
