import type { TransactionContext } from "../database/transaction";

export const PAYMENT_ATTEMPT_PAYMENT_STATE = {
    UNKNOWN: "UNKNOWN",
    PENDING: "PENDING",
    PARTIAL: "PARTIAL",
    PAID: "PAID",
    CANCELLED: "CANCELLED",
    EXPIRED: "EXPIRED",
    MISMATCH: "MISMATCH",
} as const;

export const PAYMENT_ATTEMPT_ORDER_STATE = {
    NOT_CREATED: "NOT_CREATED",
    FINALIZING: "FINALIZING",
    CREATED: "CREATED",
    REVIEW_REQUIRED: "REVIEW_REQUIRED",
} as const;

export const PAYMENT_ATTEMPT_RESOLUTION_STATE = {
    NONE: "NONE",
    OPEN: "OPEN",
    REFUND_RECORDED: "REFUND_RECORDED",
    RESOLVED: "RESOLVED",
} as const;

export type PaymentAttemptPaymentState = (typeof PAYMENT_ATTEMPT_PAYMENT_STATE)[keyof typeof PAYMENT_ATTEMPT_PAYMENT_STATE];
export type PaymentAttemptOrderState = (typeof PAYMENT_ATTEMPT_ORDER_STATE)[keyof typeof PAYMENT_ATTEMPT_ORDER_STATE];
export type PaymentAttemptResolutionState = (typeof PAYMENT_ATTEMPT_RESOLUTION_STATE)[keyof typeof PAYMENT_ATTEMPT_RESOLUTION_STATE];
export type PaymentAttemptOwner =
    | { kind: "authenticated"; userId: string }
    | { kind: "guest"; guestCartId: string };

export type PaymentAttemptFindClaimInput = {
    owner: PaymentAttemptOwner;
    idempotencyKey: string;
    request: unknown;
};

export type PaymentAttemptDisplaySnapshot = {
    items: Array<{ productId: number; name: string; quantity: number; unitPriceVnd: number }>;
    subtotalVnd: number;
    discountVnd: number;
    shippingVnd: number;
    delivery?: { method: string; eta?: string | null };
};

export type PaymentAttemptClaimInput = {
    owner: PaymentAttemptOwner;
    idempotencyKey: string;
    request: unknown;
    snapshot: PaymentAttemptDisplaySnapshot;
    pendingCheckoutId: number;
    expectedAmountVnd: number;
    expiresAt: Date;
};

export type PaymentAttemptRecord = {
    id: string;
    ownerScope: string;
    idempotencyKeyHash: string;
    requestHash: string;
    snapshotHash: string;
    pendingCheckoutId: number;
    providerOrderCode: string;
    expectedAmountVnd: number;
    paymentState: PaymentAttemptPaymentState;
    orderState: PaymentAttemptOrderState;
    resolutionState: PaymentAttemptResolutionState;
    providerLinkId?: string | null;
    providerLinkUrl?: string | null;
    expiresAt?: string | null;
};

export type PaymentAttemptClaim = PaymentAttemptRecord & { replayed: boolean };

export type PaymentAttemptProjection = {
    id: string;
    paymentState: PaymentAttemptPaymentState;
    orderState: PaymentAttemptOrderState;
    resolutionState: PaymentAttemptResolutionState;
    verifiedReceivedAmountVnd?: number;
    orderId?: number | null;
    inserted: boolean;
    conflicting: boolean;
};

export type PaymentAttemptObservationInput = {
    attemptId: string;
    source: "WEBHOOK" | "LOOKUP" | "SIMULATOR";
    sourceKey: string;
    payload: unknown;
    providerOrderCode?: string | null;
    providerLinkId?: string | null;
    expectedAmountVnd: number;
    reportedAmountVnd?: number | null;
    paidAmountVnd?: number | null;
    currency?: string | null;
    normalizedStatus: string;
    verifiedAt?: Date | null;
    verified: boolean;
    providerReportsNoPaidFunds?: boolean;
    sanitizedReason?: string | null;
};

export type PaymentAttemptObservationResult = PaymentAttemptProjection;

export type PaymentAttemptStatus = {
    attemptId: string;
    providerOrderCode: string;
    paymentState: PaymentAttemptPaymentState;
    orderState: PaymentAttemptOrderState;
    resolutionState: PaymentAttemptResolutionState;
    orderId: number | null;
    items: PaymentAttemptDisplaySnapshot["items"];
    delivery: PaymentAttemptDisplaySnapshot["delivery"] | null;
    subtotalVnd: number;
    discountVnd: number;
    shippingVnd: number;
    payableVnd: number;
    currency: "VND";
    expiresAt: string;
    lastCheckedAt: string | null;
    retryAfterSeconds: number | null;
    supportReference: string;
    resumeUrl: string | null;
};

export type PaymentAttemptOwnedStatusInput = { attemptId: string; owner: PaymentAttemptOwner };
export type PaymentAttemptOwnerActionInput = PaymentAttemptOwnedStatusInput;

export type PaymentAttemptRefundInput = {
    attemptId: string;
    transferReference: string;
    idempotencyKey: string;
    amountVnd: number;
    transferredAt: Date;
    evidenceId: number;
    actorId: string;
    reason: string;
};

export type PaymentAttemptRefundResult = { operationId: string; amountVnd: number; replayed: boolean };
export type PaymentAttemptTransaction = TransactionContext;
export type PaymentAttemptCreateLease = { attemptId: string; leaseToken: string; leaseUntil: Date };
export type PaymentAttemptProviderLink = { attemptId: string; leaseToken: string; providerOrderCode: string; providerLinkId: string; providerLinkUrl: string; amountVnd: number; currency: "VND" };
