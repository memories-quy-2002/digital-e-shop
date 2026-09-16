import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import { withTransaction, type TransactionContext } from "../database/transaction";
import { NestOrdersService } from "../orders/orders.service";
import { PaymentReconciliationRepository, type WebhookEventInput } from "./payment-reconciliation.repository";

export type VerifiedPayOSWebhookData = {
    orderCode?: number | string | null;
    paymentLinkId?: string | null;
    amount?: number | string | null;
    currency?: string | null;
    reference?: string | null;
    transactionDateTime?: string | null;
    code?: string | null;
    status?: string | null;
};

export type VerifiedPayOSWebhook = {
    envelope: {
        code?: string | null;
        success?: unknown;
    };
    data: VerifiedPayOSWebhookData;
};

export type PayOSWebhookOutcome = {
    kind: "processed" | "duplicate" | "ignored" | "mismatch" | "retryable";
    httpStatus: 200 | 500;
    eventId: number;
    orderId?: number;
    message?: string;
};

type NormalizedPayOSWebhook = {
    envelopeCode: string | null;
    envelopeSuccess: boolean | null;
    orderCode: number | null;
    paymentLinkId: string | null;
    amount: number | null;
    currency: string | null;
    reference: string | null;
    transactionDateTime: string | null;
    code: string | null;
    status: string;
};

const sha256 = (value: string): string => createHash("sha256").update(value).digest("hex");

export const buildPayOSEventKey = (data: VerifiedPayOSWebhookData & { status?: string | null }): string => {
    const reference = String(data.reference || "").trim();
    if (reference) return "payos:" + reference;

    const normalized = {
        orderCode: data.orderCode == null || data.orderCode === "" ? null : Number(data.orderCode),
        paymentLinkId: data.paymentLinkId ? String(data.paymentLinkId) : null,
        amount: data.amount == null || data.amount === "" ? null : Number(data.amount),
        currency: data.currency ? String(data.currency) : null,
        code: data.code ? String(data.code) : null,
        status: data.status ? String(data.status) : (data.code === "00" ? "PAID" : "FAILED"),
        transactionDateTime: data.transactionDateTime ? String(data.transactionDateTime) : null,
    };
    return "payos:sha256:" + sha256(JSON.stringify(normalized));
};
const normalize = (input: VerifiedPayOSWebhook): NormalizedPayOSWebhook => {
    const data = input.data || {};
    const code = data.code == null ? null : String(data.code);
    return {
        envelopeCode: input.envelope?.code == null ? null : String(input.envelope.code),
        envelopeSuccess: input.envelope?.success === true ? true : null,
        orderCode: data.orderCode == null || data.orderCode === "" ? null : Number(data.orderCode),
        paymentLinkId: data.paymentLinkId ? String(data.paymentLinkId).trim() : null,
        amount: data.amount == null || data.amount === "" ? null : Number(data.amount),
        currency: data.currency ? String(data.currency).trim().toUpperCase() : null,
        reference: data.reference ? String(data.reference).trim() : null,
        transactionDateTime: data.transactionDateTime ? String(data.transactionDateTime).trim() : null,
        code,
        status: data.status ? String(data.status).trim().toUpperCase() : (code === "00" ? "PAID" : "FAILED"),
    };
};

const isSuccessful = (data: NormalizedPayOSWebhook): boolean =>
    data.envelopeSuccess === true && data.envelopeCode === "00" && data.code === "00";

const isValidSuccessfulData = (data: NormalizedPayOSWebhook): boolean =>
    Number.isSafeInteger(data.orderCode)
    && Number(data.orderCode) > 0
    && Number.isSafeInteger(data.amount)
    && Number(data.amount) > 0
    && data.currency === "VND"
    && Boolean(data.paymentLinkId);

const safeErrorMessage = (error: unknown): string => {
    const message = error instanceof Error ? error.message : String(error || "Unknown payment processing error");
    return message.slice(0, 500);
};

const errorStatusCode = (error: unknown): number | undefined => {
    const value = (error as { statusCode?: unknown })?.statusCode;
    return typeof value === "number" ? value : undefined;
};

const isPayOSReservationMismatch = (error: unknown): boolean =>
    errorStatusCode(error) === 409
    && safeErrorMessage(error) === "PayOS payment amount or reference does not match the checkout reservation.";
@Injectable()
export class PaymentReconciliationService {
    constructor(
        private readonly repository: PaymentReconciliationRepository,
        private readonly ordersService: NestOrdersService,
    ) {}

    buildPayOSEventKey(data: VerifiedPayOSWebhookData): string {
        return buildPayOSEventKey(data);
    }

    async handleVerifiedPayOSWebhook(input: VerifiedPayOSWebhook): Promise<PayOSWebhookOutcome> {
        const data = normalize(input);
        if (isSuccessful(data) && !isValidSuccessfulData(data)) {
            throw Object.assign(new Error("Invalid PayOS payment data"), { statusCode: 400 });
        }

        const normalizedPayload = {
            envelopeCode: data.envelopeCode,
            envelopeSuccess: data.envelopeSuccess,
            orderCode: data.orderCode,
            paymentLinkId: data.paymentLinkId,
            amount: data.amount,
            currency: data.currency,
            reference: data.reference,
            transactionDateTime: data.transactionDateTime,
            code: data.code,
            status: data.status,
        };
        const eventInput: WebhookEventInput = {
            provider: "payos",
            eventKey: buildPayOSEventKey(data),
            eventType: isSuccessful(data) ? "PAYMENT_SUCCESS" : "PAYMENT_STATUS",
            payloadHash: sha256(JSON.stringify(normalizedPayload)),
            normalizedPayload,
            orderCode: data.orderCode,
            paymentLinkId: data.paymentLinkId,
            amount: data.amount,
            currency: data.currency,
        };

        const claimResult = await withTransaction(async (tx) => {
            const claim = await this.repository.claimWebhookEvent(tx, eventInput);
            const expectedAttemptCount = Number(claim.attemptCount || 0);
            const complete = (status: string, error: string | null, expectedStatus: string, attemptCount: number) =>
                this.repository.completeWebhookEvent(tx, claim.eventId, status, error, { expectedStatus, expectedAttemptCount: attemptCount });
            if (claim.conflict || !claim.payloadHashMatches) {
                const completed = await complete("MISMATCH", "PayOS event key was reused with a different payload.", claim.status, expectedAttemptCount);
                return completed
                    ? { kind: "mismatch" as const, eventId: claim.eventId, message: "PayOS event key conflict" }
                    : { kind: "retryable" as const, eventId: claim.eventId, message: "PayOS event conflict transition was superseded." };
            }
            if (!claim.inserted && ["PROCESSED", "IGNORED", "MISMATCH"].includes(claim.status)) {
                return { kind: "duplicate" as const, eventId: claim.eventId };
            }
            if (!claim.inserted && claim.status === "PROCESSING" && !claim.reclaimed) {
                return { kind: "retryable" as const, eventId: claim.eventId, message: "PayOS webhook is already being processed." };
            }
            if (!isSuccessful(data)) {
                const completed = await complete("IGNORED", "PayOS event did not report a successful payment.", claim.status, expectedAttemptCount);
                return completed
                    ? { kind: "ignored" as const, eventId: claim.eventId }
                    : { kind: "retryable" as const, eventId: claim.eventId, message: "PayOS event transition was superseded." };
            }
            if (claim.reclaimed) {
                return { kind: "processing" as const, eventId: claim.eventId, attemptCount: expectedAttemptCount };
            }
            const completed = await complete("PROCESSING", null, claim.status, expectedAttemptCount);
            return completed
                ? { kind: "processing" as const, eventId: claim.eventId, attemptCount: expectedAttemptCount + 1 }
                : { kind: "retryable" as const, eventId: claim.eventId, message: "PayOS event claim transition was superseded." };
        });

        if (claimResult.kind !== "processing") {
            return {
                ...claimResult,
                httpStatus: claimResult.kind === "retryable" ? 500 : 200,
            };
        }

        const processingAttemptCount = claimResult.attemptCount;
        const completionGuard = { expectedStatus: "PROCESSING", expectedAttemptCount: processingAttemptCount };
        const completeTerminal = (tx: TransactionContext, status: string, error: string | null) =>
            this.repository.completeWebhookEvent(tx, claimResult.eventId, status, error, completionGuard);

        try {
            const order = await this.ordersService.finalizePayOSCheckout(
                data.orderCode as number,
                data.paymentLinkId as string,
                data.amount as number,
            );
            if (!order) {
                const completed = await withTransaction((tx) => completeTerminal(tx, "IGNORED", "No matching local PayOS reservation or order was found."));
                return completed
                    ? { kind: "ignored", httpStatus: 200, eventId: claimResult.eventId }
                    : { kind: "retryable", httpStatus: 500, eventId: claimResult.eventId, message: "PayOS webhook transition was superseded." };
            }
            const completed = await withTransaction((tx) => completeTerminal(tx, "PROCESSED", null));
            return completed
                ? { kind: "processed", httpStatus: 200, eventId: claimResult.eventId, orderId: order.id }
                : { kind: "retryable", httpStatus: 500, eventId: claimResult.eventId, message: "PayOS webhook transition was superseded." };
        } catch (error) {
            const message = safeErrorMessage(error);
            if (isPayOSReservationMismatch(error)) {
                const completed = await withTransaction((tx) => completeTerminal(tx, "MISMATCH", message));
                return completed
                    ? { kind: "mismatch", httpStatus: 200, eventId: claimResult.eventId, message }
                    : { kind: "retryable", httpStatus: 500, eventId: claimResult.eventId, message: "PayOS webhook transition was superseded." };
            }
            const completed = await withTransaction((tx) => completeTerminal(tx, "FAILED", message));
            return completed
                ? { kind: "retryable", httpStatus: 500, eventId: claimResult.eventId, message: "PayOS webhook processing failed." }
                : { kind: "retryable", httpStatus: 500, eventId: claimResult.eventId, message: "PayOS webhook transition was superseded." };
        }
    }
}
