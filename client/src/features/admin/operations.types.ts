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
