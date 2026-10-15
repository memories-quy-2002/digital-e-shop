export type CodSettlementStatus = "PENDING" | "MATCHED" | "MISMATCH";

export type CodSettlement = {
    id: number;
    orderId: number;
    expectedCodVnd: number;
    collectedVnd: number;
    carrierFeeVnd: number;
    remittedVnd: number;
    currency: "VND";
    status: CodSettlementStatus;
    actualCarrierFeeVnd?: number | null;
    sandbox?: boolean;
};

export type CodSettlementsPage = { settlements: CodSettlement[]; nextAfterId: number | null };
export type SettlementInput = { remittedVnd: number; transferReference: string; transferDate: string; evidenceId: number };
export type FinancialEvidence = { id: number; sha256: string; originalFilename: string; mimeType: string; byteSize: number };

export type EmailOperation = {
    id: number;
    eventType: string;
    recipientMasked: string;
    locale: "en" | "vi";
    state: "QUEUED" | "SENDING" | "ACCEPTED" | "DELIVERED" | "BOUNCED" | "SANDBOX" | "FAILED" | "REVIEW_REQUIRED" | string;
    providerMessageId: string | null;
    createdAt: string;
    updatedAt: string;
    lastErrorCode: string | null;
};
export type EmailOperationsPage = { messages: EmailOperation[]; nextAfterId: number | null };
export type TaskRunnerSummary = { claimed: number; succeeded: number; retried: number; failed: number; reviewRequired: number; elapsedMs: number };

export type PaymentAttemptException = {
    attemptId: string;
    providerOrderCode: string;
    paymentState: string;
    orderState: string;
    resolutionState: string;
    expectedAmountVnd: number;
    receivedAmountVnd: number;
    refundedAmountVnd: number;
    refundableAmountVnd: number;
    pendingCheckoutId: number;
    createdAt: string;
    updatedAt: string;
};
export type PaymentAttemptRefund = {
    operationId: string;
    amountVnd: number;
    transferReference: string;
    transferredAt: string;
    evidenceId: number;
    evidenceUrl: string;
    reason: string;
    createdAt: string;
};
export type PaymentAttemptExceptionDetail = PaymentAttemptException & {
    currency: "VND";
    items: Array<{ productId: number; name: string; quantity: number; unitPriceVnd: number }>;
    subtotalVnd: number;
    discountVnd: number;
    shippingVnd: number;
    payableVnd: number;
    refunds: PaymentAttemptRefund[];
};
export type PaymentAttemptExceptionPage = {
    items: PaymentAttemptException[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
    msg: string;
    requestId: string;
};
