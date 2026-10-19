import type { AfterSalesStatus } from "./types";

export const AFTER_SALES_PAGINATION = {
    FIRST_PAGE: 1,
    DEFAULT_PAGE_SIZE: 50,
    MAX_PAGE_SIZE: 100,
} as const;

export const AFTER_SALES_REQUEST_REASON_MAX_LENGTH = 5_000;

export const AFTER_SALES_STATUS_TRANSLATION_KEYS: Record<AfterSalesStatus, string> = {
    REQUESTED: "requested",
    APPROVED: "approved",
    REJECTED: "rejected",
    RECEIVED: "received",
    REFUND_PENDING: "refundPending",
    REFUNDED: "refunded",
    CLOSED: "closed",
};
