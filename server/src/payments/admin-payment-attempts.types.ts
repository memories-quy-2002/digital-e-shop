export type AdminPaymentAttemptQueueItem = {
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

export type AdminPaymentAttemptRefundRecord = {
    operationId: string;
    amountVnd: number;
    transferReference: string;
    transferredAt: string;
    evidenceId: number;
    evidenceUrl: string;
    reason: string;
    createdAt: string;
};

export type AdminPaymentAttemptDetail = AdminPaymentAttemptQueueItem & {
    currency: "VND";
    items: Array<{ productId: number; name: string; quantity: number; unitPriceVnd: number }>;
    subtotalVnd: number;
    discountVnd: number;
    shippingVnd: number;
    payableVnd: number;
    refunds: AdminPaymentAttemptRefundRecord[];
};
