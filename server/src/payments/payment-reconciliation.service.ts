import { Injectable, Optional } from "@nestjs/common";
import { createHash } from "node:crypto";
import { withTransaction, type TransactionContext } from "../database/transaction";
import { NestOrdersService } from "../orders/orders.service";
import { PaymentReconciliationRepository, type CandidateFilters, type CandidatePage, type WebhookEventInput } from "./payment-reconciliation.repository";
import { PayOSService } from "./payos.service";
import type { PayOSPaymentLookup } from "./payment.types";

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
const adminPaymentError = (message: string, statusCode: number, details?: unknown) => Object.assign(new Error(message), { statusCode, ...(details === undefined ? {} : { details }) });
const toPositiveSafeInteger = (value: unknown): number | null => {
    const numberValue = Number(value);
    return Number.isSafeInteger(numberValue) && numberValue > 0 ? numberValue : null;
};
const toIntegerOrNull = (value: unknown): number | null => {
    const numberValue = Number(value);
    return Number.isSafeInteger(numberValue) ? numberValue : null;
};
const normalizeNote = (value: unknown): string | null => {
    const note = typeof value === "string" ? value.trim() : "";
    return note || null;
};
type PayOSTarget = {
    targetType: "pending_checkout" | "order_payment";
    targetId: number;
    pendingCheckoutId?: number;
    orderPaymentId?: number;
    providerOrderCode: number | null;
    paymentLinkId: string | null;
    expectedAmount: number;
    expectedCurrency: string;
    localStatus: string;
    requestedBy: string | null;
};
const comparePayOSPayment = (target: PayOSTarget, provider: PayOSPaymentLookup): string | null => {
    if (provider.orderCode !== target.providerOrderCode) return "PayOS order code does not match the local payment.";
    if (String(provider.paymentLinkId) !== String(target.paymentLinkId)) return "PayOS payment link ID does not match the local payment.";
    if (toIntegerOrNull(provider.amount) !== toIntegerOrNull(target.expectedAmount)) return "PayOS payment amount does not match the local payment.";
    if (String(provider.currency || "").toUpperCase() !== target.expectedCurrency) return "PayOS payment currency does not match the local payment.";
    if (String(provider.status || "").toUpperCase() !== "PAID") return `PayOS payment status is ${String(provider.status || "UNKNOWN")}.`;
    if (toIntegerOrNull(provider.amountPaid) !== toIntegerOrNull(target.expectedAmount)) return "PayOS paid amount does not match the local payment.";
    return null;
};
@Injectable()
export class PaymentReconciliationService {
    constructor(
        private readonly repository: PaymentReconciliationRepository,
        private readonly ordersService: NestOrdersService,
        @Optional() private readonly payosService?: PayOSService,
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
    async listCandidates(filters: CandidateFilters): Promise<CandidatePage> {
        return withTransaction((tx) => this.repository.listCandidates({ ...filters, page: Math.max(1, Math.floor(filters.page || 1)), limit: Math.min(100, Math.max(1, Math.floor(filters.limit || 50))) }, tx));
    }

    async runReconciliation(input: { limit?: number; requestedBy?: string | null }) {
        const limit = Math.min(100, Math.max(1, Math.floor(input.limit || 50)));
        const page = await this.listCandidates({ provider: "payos", page: 1, limit });
        const results = [];
        for (const candidate of page.candidates) {
            try {
                results.push(candidate.target_type === "pending_checkout" ? await this.reconcilePendingCheckout(candidate.target_id, input.requestedBy || null, false) : await this.reconcilePayment(candidate.target_id, input.requestedBy || null, false));
            } catch (error) {
                results.push({ targetType: candidate.target_type, targetId: candidate.target_id, outcome: "FAILED", error: safeErrorMessage(error) });
            }
        }
        return { results, limit };
    }

    async reconcilePayment(paymentId: number, requestedBy?: string | null, throwUnavailable = true) {
        const payment = await withTransaction((tx) => this.repository.getOrderPaymentForUpdate(tx, paymentId));
        if (!payment) throw adminPaymentError("Payment not found", 404);
        if (String(payment.provider).toLowerCase() !== "payos") throw adminPaymentError("Payment cannot be reconciled with PayOS", 409);
        return this.reconcilePayOSTarget({ targetType: "order_payment", targetId: paymentId, orderPaymentId: paymentId, providerOrderCode: toPositiveSafeInteger(payment.provider_reference), paymentLinkId: payment.provider_payment_id ? String(payment.provider_payment_id) : null, expectedAmount: Number(payment.amount), expectedCurrency: String(payment.currency || "").toUpperCase(), localStatus: String(payment.status || ""), requestedBy: requestedBy || null, throwUnavailable });
    }

    async confirmCod(paymentId: number, input: { note?: string } = {}, requestedBy?: string | null) {
        return withTransaction(async (tx) => {
            const payment = await this.repository.getOrderPaymentForUpdate(tx, paymentId);
            if (!payment) throw adminPaymentError("Payment not found", 404);
            if (String(payment.provider).toLowerCase() !== "cash") throw adminPaymentError("Only cash payments can be confirmed as COD", 409);
            if (!["pending", "paid"].includes(String(payment.status).toLowerCase())) throw adminPaymentError("COD payment is not pending or paid", 409);
            const confirmed = String(payment.status).toLowerCase() === "pending" ? await this.repository.confirmCashPayment(tx, paymentId) : payment;
            if (!confirmed) throw adminPaymentError("Payment not found", 404);
            await this.repository.recordAttempt(tx, { provider: "cash", orderPaymentId: paymentId, requestedBy: requestedBy || null, outcome: "MANUAL_CONFIRMED", localStatus: String(payment.status), providerStatus: "COLLECTED", expectedAmount: toIntegerOrNull(payment.amount), expectedCurrency: String(payment.currency || "").toUpperCase() || null, mismatchReason: normalizeNote(input.note) });
            return confirmed;
        });
    }

    async listWebhookEvents(paymentId: number) {
        return withTransaction(async (tx) => {
            const payment = await this.repository.getOrderPaymentForUpdate(tx, paymentId);
            if (!payment) throw adminPaymentError("Payment not found", 404);
            return this.repository.listWebhookEvents(tx, paymentId);
        });
    }

    private async reconcilePendingCheckout(pendingCheckoutId: number, requestedBy: string | null, throwUnavailable: boolean) {
        const checkout = await withTransaction((tx) => this.repository.getPendingCheckoutForUpdate(tx, pendingCheckoutId));
        if (!checkout) throw adminPaymentError("Payment not found", 404);
        if (String(checkout.payment_provider).toLowerCase() !== "payos") throw adminPaymentError("Payment cannot be reconciled with PayOS", 409);
        return this.reconcilePayOSTarget({ targetType: "pending_checkout", targetId: pendingCheckoutId, pendingCheckoutId, providerOrderCode: toPositiveSafeInteger(checkout.provider_order_code), paymentLinkId: checkout.provider_reference ? String(checkout.provider_reference) : null, expectedAmount: Number(checkout.payment_amount), expectedCurrency: String(checkout.payment_currency || "").toUpperCase(), localStatus: String(checkout.status || ""), requestedBy, throwUnavailable });
    }

    private async reconcilePayOSTarget(target: PayOSTarget & { throwUnavailable: boolean }) {
        if (!this.payosService) throw adminPaymentError("PayOS payments are not configured", 503);
        const identifier = target.providerOrderCode ? { orderCode: target.providerOrderCode } : (target.paymentLinkId ? { paymentLinkId: target.paymentLinkId } : null);
        if (!identifier) throw adminPaymentError("Payment has no PayOS provider reference", 409);
        let provider: PayOSPaymentLookup;
        try { provider = await this.payosService.getPaymentLink(identifier); }
        catch { const result = await this.persistReconciliationOutcome(target, "UNAVAILABLE", "PayOS provider lookup was unavailable."); if (target.throwUnavailable) throw adminPaymentError("PayOS provider is unavailable", 503, result); return result; }
        const mismatchReason = comparePayOSPayment(target, provider);
        if (mismatchReason) return this.persistReconciliationOutcome(target, "MISMATCH", mismatchReason, provider);
        try {
            const order = await this.ordersService.finalizePayOSCheckout(provider.orderCode, provider.paymentLinkId, provider.amount);
            if (!order) return this.persistReconciliationOutcome(target, "MISMATCH", "No matching local PayOS reservation or order was found.", provider);
            let orderPaymentId = target.orderPaymentId;
            if (!orderPaymentId) {
                const payment = await withTransaction((tx) => this.repository.getOrderPaymentByOrderId(tx, Number(order.id)));
                orderPaymentId = payment?.id ? Number(payment.id) : undefined;
            }
            if (!orderPaymentId) return this.persistReconciliationOutcome(target, "FAILED", "Finalized PayOS order has no payment ledger row.", provider);
            return this.persistReconciliationOutcome({ ...target, orderPaymentId }, "MATCHED", null, provider);
        } catch (error) {
            const reason = safeErrorMessage(error);
            const outcome = isPayOSReservationMismatch(error) ? "MISMATCH" : "FAILED";
            const result = await this.persistReconciliationOutcome(target, outcome, reason, provider);
            if (outcome === "FAILED") throw adminPaymentError("Unable to reconcile PayOS payment", 500, result);
            return result;
        }
    }

    private persistReconciliationOutcome(target: PayOSTarget & { orderPaymentId?: number }, outcome: "MATCHED" | "MISMATCH" | "UNAVAILABLE" | "FAILED", reason: string | null, provider?: PayOSPaymentLookup) {
        return withTransaction(async (tx) => {
            await this.repository.recordAttempt(tx, { provider: "payos", pendingCheckoutId: target.pendingCheckoutId, orderPaymentId: target.orderPaymentId, requestedBy: target.requestedBy, outcome, localStatus: target.localStatus, providerStatus: provider?.status || null, expectedAmount: toIntegerOrNull(target.expectedAmount), providerAmount: provider ? toIntegerOrNull(provider.amount) : null, expectedCurrency: target.expectedCurrency || null, providerCurrency: provider?.currency || null, providerReference: provider?.paymentLinkId || null, mismatchReason: reason });
            if (target.orderPaymentId) await this.repository.projectReconciliation(tx, { orderPaymentId: target.orderPaymentId, reconciliationStatus: outcome, providerStatus: provider?.status || null, error: reason });
            return { targetType: target.targetType, targetId: target.targetId, ...(target.orderPaymentId ? { paymentId: target.orderPaymentId } : {}), outcome, ...(reason ? { error: reason } : {}) };
        });
}
}
