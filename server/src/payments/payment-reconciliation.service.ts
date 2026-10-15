import { Injectable, Optional } from "@nestjs/common";
import { createHash } from "node:crypto";
import { withTransaction, type TransactionContext } from "../database/transaction";
import { NestOrdersService } from "../orders/orders.service";
import { PaymentReconciliationRepository, type CandidateFilters, type CandidatePage, type WebhookEventInput } from "./payment-reconciliation.repository";
import { PayOSService } from "./payos.service";
import { PaymentAttemptService } from "./payment-attempt.service";
import { TasksService } from "../operations/tasks.service";
import type { PaymentAttemptOwner } from "./payment-attempt.types";
import type { PaymentAttemptObservationInput, PaymentAttemptProjection } from "./payment-attempt.types";
import {
    PAYMENT_PROVIDER,
    PAYMENT_STATUS,
    PAYMENT_RECONCILIATION_STATUS,
    PAYMENT_RECONCILIATION_OUTCOME,
    PAYMENT_RECONCILIATION_TARGET_TYPE,
    PAYMENT_WEBHOOK_EVENT_STATUS,
    PAYMENT_PROVIDER_STATUS,
    PAYMENT_CURRENCY,
    PAYOS_SUCCESS_CODE,
    type PaymentReconciliationOutcome,
    type PaymentReconciliationTargetType,
    type PayOSPaymentLookup,
} from "./payment.types";
import { HTTP_STATUS } from "#src/shared/constants/http-status";
import { PAYMENT_RECONCILIATION_LIMIT } from "./payment-reconciliation.constants";

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
    data: VerifiedPayOSWebhookData;
};

export type PayOSWebhookOutcome = {
    kind: "processed" | "duplicate" | "ignored" | "mismatch" | "retryable";
    httpStatus: typeof HTTP_STATUS.OK | typeof HTTP_STATUS.INTERNAL_SERVER_ERROR;
    eventId: number;
    orderId?: number;
    message?: string;
};

type NormalizedPayOSWebhook = {
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
    if (reference) return `${PAYMENT_PROVIDER.PAYOS}:` + reference;

    const normalized = {
        orderCode: data.orderCode == null || data.orderCode === "" ? null : Number(data.orderCode),
        paymentLinkId: data.paymentLinkId ? String(data.paymentLinkId) : null,
        amount: data.amount == null || data.amount === "" ? null : Number(data.amount),
        currency: data.currency ? String(data.currency) : null,
        code: data.code ? String(data.code) : null,
        status: data.status ? String(data.status) : (data.code === PAYOS_SUCCESS_CODE ? PAYMENT_PROVIDER_STATUS.PAYOS_PAID : PAYMENT_PROVIDER_STATUS.PAYOS_FAILED),
        transactionDateTime: data.transactionDateTime ? String(data.transactionDateTime) : null,
    };
    return `${PAYMENT_PROVIDER.PAYOS}:sha256:` + sha256(JSON.stringify(normalized));
};
const normalize = (input: VerifiedPayOSWebhook): NormalizedPayOSWebhook => {
    const data = input.data || {};
    const code = data.code == null ? null : String(data.code);
    const orderCode = data.orderCode == null || data.orderCode === "" ? null : Number(data.orderCode);
    const amount = data.amount == null || data.amount === "" ? null : Number(data.amount);
    return {
        orderCode: Number.isSafeInteger(orderCode) ? orderCode : null,
        paymentLinkId: data.paymentLinkId ? String(data.paymentLinkId).trim() : null,
        amount: Number.isSafeInteger(amount) ? amount : null,
        currency: data.currency ? String(data.currency).trim().toUpperCase() : null,
        reference: data.reference ? String(data.reference).trim() : null,
        transactionDateTime: data.transactionDateTime ? String(data.transactionDateTime).trim() : null,
        code,
        status: data.status ? String(data.status).trim().toUpperCase() : (code === PAYOS_SUCCESS_CODE ? PAYMENT_PROVIDER_STATUS.PAYOS_PAID : PAYMENT_PROVIDER_STATUS.PAYOS_FAILED),
    };
};

const isSuccessful = (data: NormalizedPayOSWebhook): boolean => data.code === PAYOS_SUCCESS_CODE;

const isValidSuccessfulData = (data: NormalizedPayOSWebhook): boolean =>
    Number.isSafeInteger(data.orderCode)
    && Number(data.orderCode) > 0
    && Number.isSafeInteger(data.amount)
    && Number(data.amount) > 0
    && data.currency === PAYMENT_CURRENCY.VND
    && Boolean(data.paymentLinkId);
const hasLookupableOrderCode = (data: NormalizedPayOSWebhook): boolean =>
    Number.isSafeInteger(data.orderCode) && Number(data.orderCode) > 0;
const toNonNegativeSafeInteger = (value: unknown): number | null => {
    if (value == null || value === "") return null;
    const amount = Number(value);
    return Number.isSafeInteger(amount) && amount >= 0 ? amount : null;
};
const providerReportsNoPaidFunds = (value: unknown): boolean => value == null || toNonNegativeSafeInteger(value) === 0;
const toDateOrNow = (value: string | null): Date => {
    if (!value) return new Date();
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? new Date() : date;
};

const safeErrorMessage = (error: unknown): string => {
    const message = error instanceof Error ? error.message : String(error || "Unknown payment processing error");
    return message.slice(0, 500);
};

const isPayOSReviewRequired = (result: unknown): result is { reviewRequired: true; reason: string } => {
    if (typeof result !== "object" || result === null) return false;
    const candidate = result as { reviewRequired?: unknown; reason?: unknown };
    return candidate.reviewRequired === true && typeof candidate.reason === "string";
};

const errorStatusCode = (error: unknown): number | undefined => {
    const value = (error as { statusCode?: unknown })?.statusCode;
    return typeof value === "number" ? value : undefined;
};

const isPayOSReservationMismatch = (error: unknown): boolean =>
    errorStatusCode(error) === HTTP_STATUS.CONFLICT
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
    targetType: PaymentReconciliationTargetType;
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
        @Optional() private readonly paymentAttemptService?: PaymentAttemptService,
        @Optional() private readonly tasksService?: TasksService,
    ) {}

    buildPayOSEventKey(data: VerifiedPayOSWebhookData): string {
        return buildPayOSEventKey(data);
    }

    getOwnedAttemptStatus(attemptId: string, owner: PaymentAttemptOwner) {
        if (!this.paymentAttemptService) throw adminPaymentError("Payment attempt status is unavailable", HTTP_STATUS.SERVICE_UNAVAILABLE);
        return this.paymentAttemptService.getOwnedStatus({ attemptId, owner });
    }

    async requestOwnedReconciliation(attemptId: string, owner: PaymentAttemptOwner) {
        if (!this.paymentAttemptService || !this.tasksService) throw adminPaymentError("Payment attempt recovery is unavailable", HTTP_STATUS.SERVICE_UNAVAILABLE);
        return withTransaction(async (tx) => {
            const now = new Date();
            const target = await this.paymentAttemptService!.claimOwnedReconciliationRequest({ attemptId, owner }, now, tx);
            if (!target) throw adminPaymentError("Payment attempt not found", HTTP_STATUS.NOT_FOUND);
            if (target.coalesced) return { accepted: true, retryAfterSeconds: target.retryAfterSeconds };
            const scheduled = await this.tasksService!.enqueuePayOSReconciliationRequest(
                tx,
                attemptId,
                { attemptId, pendingCheckoutId: target.pendingCheckoutId, generation: 0, expiresAt: target.expiresAt, operation: "RECONCILE" },
                new Date(now.getTime() + 15_000),
            );
            return { accepted: true, retryAfterSeconds: Math.max(1, Math.ceil((scheduled.dueAt.getTime() - now.getTime()) / 1000)) };
        });
    }

    async requestOwnedCancellation(attemptId: string, owner: PaymentAttemptOwner) {
        if (!this.paymentAttemptService || !this.tasksService) throw adminPaymentError("Payment attempt cancellation is unavailable", HTTP_STATUS.SERVICE_UNAVAILABLE);
        return withTransaction(async (tx) => {
            const attempt = await this.paymentAttemptService!.requestOwnedCancellation({ attemptId, owner }, tx);
            if (!attempt) throw adminPaymentError("Payment attempt not found", HTTP_STATUS.NOT_FOUND);
            if (attempt.orderState === "CREATED") return { accepted: false, orderId: attempt.orderId ?? null, retryAfterSeconds: 0 };
            const requestedAt = attempt.cancelRequestedAt || new Date().toISOString();
            const scheduled = await this.tasksService!.enqueuePayOSCancellation(
                tx,
                attemptId,
                { attemptId, pendingCheckoutId: attempt.pendingCheckoutId, generation: 0, expiresAt: attempt.expiresAt, operation: "CANCEL", cancelRequestedAt: requestedAt, cancelSentAt: null },
                new Date(Date.now() + 15_000),
            );
            return { accepted: true, orderId: null, retryAfterSeconds: Math.max(1, Math.ceil((scheduled.dueAt.getTime() - Date.now()) / 1000)) };
        });
    }

    async handleVerifiedPayOSWebhook(input: VerifiedPayOSWebhook): Promise<PayOSWebhookOutcome> {
        const data = normalize(input);
        if (isSuccessful(data) && !hasLookupableOrderCode(data)) {
            throw Object.assign(new Error("Invalid PayOS payment data"), { statusCode: HTTP_STATUS.BAD_REQUEST });
        }

        const normalizedPayload = {
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
            provider: PAYMENT_PROVIDER.PAYOS,
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
                const completed = await complete(PAYMENT_WEBHOOK_EVENT_STATUS.MISMATCH, "PayOS event key was reused with a different payload.", claim.status, expectedAttemptCount);
                return completed
                    ? { kind: "mismatch" as const, eventId: claim.eventId, message: "PayOS event key conflict" }
                    : { kind: "retryable" as const, eventId: claim.eventId, message: "PayOS event conflict transition was superseded." };
            }
            const isFinalStatus = claim.status === PAYMENT_WEBHOOK_EVENT_STATUS.PROCESSED
                || claim.status === PAYMENT_WEBHOOK_EVENT_STATUS.IGNORED
                || claim.status === PAYMENT_WEBHOOK_EVENT_STATUS.MISMATCH;
            if (!claim.inserted && isFinalStatus) {
                return { kind: "duplicate" as const, eventId: claim.eventId };
            }
            if (!claim.inserted && claim.status === PAYMENT_WEBHOOK_EVENT_STATUS.PROCESSING && !claim.reclaimed) {
                return { kind: "retryable" as const, eventId: claim.eventId, message: "PayOS webhook is already being processed." };
            }
            if (!isSuccessful(data)) {
                const completed = await complete(PAYMENT_WEBHOOK_EVENT_STATUS.IGNORED, "PayOS event did not report a successful payment.", claim.status, expectedAttemptCount);
                return completed
                    ? { kind: "ignored" as const, eventId: claim.eventId }
                    : { kind: "retryable" as const, eventId: claim.eventId, message: "PayOS event transition was superseded." };
            }
            if (claim.reclaimed) {
                return { kind: "processing" as const, eventId: claim.eventId, attemptCount: expectedAttemptCount };
            }
            const completed = await complete(PAYMENT_WEBHOOK_EVENT_STATUS.PROCESSING, null, claim.status, expectedAttemptCount);
            return completed
                ? { kind: "processing" as const, eventId: claim.eventId, attemptCount: expectedAttemptCount + 1 }
                : { kind: "retryable" as const, eventId: claim.eventId, message: "PayOS event claim transition was superseded." };
        });

        if (claimResult.kind !== "processing") {
            return {
                ...claimResult,
                httpStatus: claimResult.kind === "retryable" ? HTTP_STATUS.INTERNAL_SERVER_ERROR : HTTP_STATUS.OK,
            };
        }

        const processingAttemptCount = claimResult.attemptCount;
        const completionGuard = { expectedStatus: PAYMENT_WEBHOOK_EVENT_STATUS.PROCESSING, expectedAttemptCount: processingAttemptCount };
        const completeTerminal = (tx: TransactionContext, status: string, error: string | null) =>
            this.repository.completeWebhookEvent(tx, claimResult.eventId, status, error, completionGuard);

        try {
            const attempt = await this.findPaymentAttempt(data.orderCode as number);
            if (attempt) {
                const projection = await this.processAttemptObservation(attempt, {
                    source: "WEBHOOK",
                    sourceKey: sha256(eventInput.eventKey),
                    payload: normalizedPayload,
                    providerOrderCode: data.orderCode == null ? null : String(data.orderCode),
                    providerLinkId: data.paymentLinkId,
                    reportedAmountVnd: toNonNegativeSafeInteger(data.amount),
                    paidAmountVnd: toNonNegativeSafeInteger(data.amount),
                    currency: data.currency,
                    normalizedStatus: data.status,
                    verifiedAt: toDateOrNow(data.transactionDateTime),
                    sanitizedReason: isValidSuccessfulData(data) ? null : "Signed PayOS payment fields do not match the attempt.",
                });
                if (projection.paymentState === "PENDING" && !projection.conflicting) {
                    const completed = await withTransaction((tx) => completeTerminal(tx, PAYMENT_WEBHOOK_EVENT_STATUS.PROCESSED, null));
                    return completed
                        ? { kind: "processed", httpStatus: HTTP_STATUS.OK, eventId: claimResult.eventId }
                        : { kind: "retryable", httpStatus: HTTP_STATUS.INTERNAL_SERVER_ERROR, eventId: claimResult.eventId, message: "PayOS webhook transition was superseded." };
                }
                if (projection.paymentState !== "PAID" || projection.conflicting) {
                    const message = "PayOS payment evidence does not exactly match the checkout attempt.";
                    const completed = await withTransaction((tx) => completeTerminal(tx, PAYMENT_WEBHOOK_EVENT_STATUS.MISMATCH, message));
                    return completed
                        ? { kind: "mismatch", httpStatus: HTTP_STATUS.OK, eventId: claimResult.eventId, message }
                        : { kind: "retryable", httpStatus: HTTP_STATUS.INTERNAL_SERVER_ERROR, eventId: claimResult.eventId, message: "PayOS webhook transition was superseded." };
                }
                if (attempt.cancelRequestedAt) {
                    const message = "Verified PayOS payment arrived after cancellation intent and requires operator resolution.";
                    await this.reopenCancelledPaymentRecovery(attempt.id, claimResult.eventId);
                    const completed = await withTransaction((tx) => completeTerminal(tx, PAYMENT_WEBHOOK_EVENT_STATUS.MISMATCH, message));
                    return completed
                        ? { kind: "mismatch", httpStatus: HTTP_STATUS.OK, eventId: claimResult.eventId, message }
                        : { kind: "retryable", httpStatus: HTTP_STATUS.INTERNAL_SERVER_ERROR, eventId: claimResult.eventId, message: "PayOS webhook transition was superseded." };
                }
            } else if (!isValidSuccessfulData(data)) {
                const message = "PayOS payment data is incomplete or invalid.";
                const completed = await withTransaction((tx) => completeTerminal(tx, PAYMENT_WEBHOOK_EVENT_STATUS.MISMATCH, message));
                return completed
                    ? { kind: "mismatch", httpStatus: HTTP_STATUS.OK, eventId: claimResult.eventId, message }
                    : { kind: "retryable", httpStatus: HTTP_STATUS.INTERNAL_SERVER_ERROR, eventId: claimResult.eventId, message: "PayOS webhook transition was superseded." };
            }
            const finalized = attempt
                ? await this.ordersService.finalizePayOSCheckout(data.orderCode as number, data.paymentLinkId as string, data.amount as number, attempt.id)
                : await this.ordersService.finalizePayOSCheckout(data.orderCode as number, data.paymentLinkId as string, data.amount as number);
            if (isPayOSReviewRequired(finalized)) {
                const message = `Verified PayOS receipt requires order review: ${finalized.reason}`;
                const completed = await withTransaction((tx) => completeTerminal(tx, PAYMENT_WEBHOOK_EVENT_STATUS.MISMATCH, message));
                return completed
                    ? { kind: "mismatch", httpStatus: HTTP_STATUS.OK, eventId: claimResult.eventId, message }
                    : { kind: "retryable", httpStatus: HTTP_STATUS.INTERNAL_SERVER_ERROR, eventId: claimResult.eventId, message: "PayOS webhook transition was superseded." };
            }
            if (!finalized) {
                const completed = await withTransaction((tx) => completeTerminal(tx, PAYMENT_WEBHOOK_EVENT_STATUS.IGNORED, "No matching local PayOS reservation or order was found."));
                return completed
                    ? { kind: "ignored", httpStatus: HTTP_STATUS.OK, eventId: claimResult.eventId }
                    : { kind: "retryable", httpStatus: HTTP_STATUS.INTERNAL_SERVER_ERROR, eventId: claimResult.eventId, message: "PayOS webhook transition was superseded." };
            }
            const orderId = "orderId" in finalized ? finalized.orderId : finalized.id;
            const completed = await withTransaction((tx) => completeTerminal(tx, PAYMENT_WEBHOOK_EVENT_STATUS.PROCESSED, null));
            return completed
                ? { kind: "processed", httpStatus: HTTP_STATUS.OK, eventId: claimResult.eventId, orderId }
                : { kind: "retryable", httpStatus: HTTP_STATUS.INTERNAL_SERVER_ERROR, eventId: claimResult.eventId, message: "PayOS webhook transition was superseded." };
        } catch (error) {
            const message = safeErrorMessage(error);
            if (isPayOSReservationMismatch(error)) {
                const completed = await withTransaction((tx) => completeTerminal(tx, PAYMENT_WEBHOOK_EVENT_STATUS.MISMATCH, message));
                return completed
                    ? { kind: "mismatch", httpStatus: HTTP_STATUS.OK, eventId: claimResult.eventId, message }
                    : { kind: "retryable", httpStatus: HTTP_STATUS.INTERNAL_SERVER_ERROR, eventId: claimResult.eventId, message: "PayOS webhook transition was superseded." };
            }
            const completed = await withTransaction((tx) => completeTerminal(tx, PAYMENT_WEBHOOK_EVENT_STATUS.FAILED, message));
            return completed
                ? { kind: "retryable", httpStatus: HTTP_STATUS.INTERNAL_SERVER_ERROR, eventId: claimResult.eventId, message: "PayOS webhook processing failed." }
                : { kind: "retryable", httpStatus: HTTP_STATUS.INTERNAL_SERVER_ERROR, eventId: claimResult.eventId, message: "PayOS webhook transition was superseded." };
        }
    }
    async listCandidates(filters: CandidateFilters): Promise<CandidatePage> {
        return withTransaction((tx) => this.repository.listCandidates({ ...filters, page: Math.max(1, Math.floor(filters.page || 1)), limit: Math.min(PAYMENT_RECONCILIATION_LIMIT.MAX, Math.max(1, Math.floor(filters.limit || PAYMENT_RECONCILIATION_LIMIT.DEFAULT))) }, tx));
    }

    async runReconciliation(input: { limit?: number; requestedBy?: string | null }) {
        const limit = Math.min(PAYMENT_RECONCILIATION_LIMIT.MAX, Math.max(1, Math.floor(input.limit || PAYMENT_RECONCILIATION_LIMIT.DEFAULT)));
        const page = await this.listCandidates({ provider: PAYMENT_PROVIDER.PAYOS, page: 1, limit });
        const results = [];
        for (const candidate of page.candidates) {
            try {
                results.push(candidate.target_type === PAYMENT_RECONCILIATION_TARGET_TYPE.PENDING_CHECKOUT ? await this.reconcilePendingCheckout(candidate.target_id, input.requestedBy || null, false) : await this.reconcilePayment(candidate.target_id, input.requestedBy || null, false));
            } catch (error) {
                results.push({ targetType: candidate.target_type, targetId: candidate.target_id, outcome: PAYMENT_RECONCILIATION_OUTCOME.FAILED, error: safeErrorMessage(error) });
            }
        }
        return { results, limit };
    }

    async reconcilePayment(paymentId: number, requestedBy?: string | null, throwUnavailable = true) {
        const payment = await withTransaction((tx) => this.repository.getOrderPaymentForUpdate(tx, paymentId));
        if (!payment) throw adminPaymentError("Payment not found", HTTP_STATUS.NOT_FOUND);
        if (String(payment.provider).toLowerCase() !== PAYMENT_PROVIDER.PAYOS) throw adminPaymentError("Payment cannot be reconciled with PayOS", HTTP_STATUS.CONFLICT);
        return this.reconcilePayOSTarget({ targetType: PAYMENT_RECONCILIATION_TARGET_TYPE.ORDER_PAYMENT, targetId: paymentId, orderPaymentId: paymentId, providerOrderCode: toPositiveSafeInteger(payment.provider_reference), paymentLinkId: payment.provider_payment_id ? String(payment.provider_payment_id) : null, expectedAmount: Number(payment.amount), expectedCurrency: String(payment.currency || "").toUpperCase(), localStatus: String(payment.status || ""), requestedBy: requestedBy || null, throwUnavailable });
    }

    async reconcilePendingCheckoutForTask(pendingCheckoutId: number, attemptId: string) {
        const checkout = await withTransaction((tx) => this.repository.getPendingCheckoutForUpdate(tx, pendingCheckoutId));
        if (!checkout) throw adminPaymentError("Payment not found", HTTP_STATUS.NOT_FOUND);
        const orderCode = toPositiveSafeInteger(checkout.provider_order_code);
        const attempt = orderCode == null ? null : await this.findPaymentAttempt(orderCode);
        if (!attempt || attempt.id !== attemptId || attempt.pendingCheckoutId !== pendingCheckoutId) {
            throw adminPaymentError("Payment attempt does not match the pending checkout", HTTP_STATUS.CONFLICT);
        }
        return this.reconcilePendingCheckout(pendingCheckoutId, null, false);
    }

    async cancelPendingCheckoutForTask(input: { pendingCheckoutId: number; attemptId: string; cancelSentAt?: string | null; verifyOnly?: boolean }) {
        if (!this.paymentAttemptService || !this.payosService) return { outcome: "UNAVAILABLE" };
        const attempt = await this.paymentAttemptService.getCancellationTaskAttempt(input.attemptId);
        if (!attempt || attempt.pendingCheckoutId !== input.pendingCheckoutId) return { outcome: "MISMATCH" };
        if (attempt.orderState === "CREATED") return { outcome: "MATCHED" };
        const requestedAt = attempt.cancelRequestedAt ? new Date(attempt.cancelRequestedAt) : new Date();
        let provider: PayOSPaymentLookup;
        try {
            provider = await this.payosService.getPaymentLink({ orderCode: Number(attempt.providerOrderCode) });
        } catch {
            if (Date.now() >= requestedAt.getTime() + 10 * 60 * 1000) {
                await this.finishCancellationWindow(input.pendingCheckoutId, input.attemptId, true);
                return { outcome: "PENDING", cancelSentAt: input.cancelSentAt, verifyOnly: true };
            }
            return { outcome: "PENDING", cancelSentAt: input.cancelSentAt, verifyOnly: Boolean(input.verifyOnly) };
        }

        const sourceKey = sha256(JSON.stringify({ attemptId: input.attemptId, orderCode: provider.orderCode, paymentLinkId: provider.paymentLinkId, amount: provider.amount, amountPaid: provider.amountPaid, status: provider.status }));
        const observed = await this.processAttemptObservation(attempt, {
            source: "LOOKUP", sourceKey,
            payload: { orderCode: provider.orderCode, paymentLinkId: provider.paymentLinkId, amount: provider.amount, amountPaid: provider.amountPaid, status: provider.status },
            providerOrderCode: String(provider.orderCode), providerLinkId: provider.paymentLinkId,
            reportedAmountVnd: toNonNegativeSafeInteger(provider.amount), paidAmountVnd: toNonNegativeSafeInteger(provider.amountPaid),
            currency: null, normalizedStatus: String(provider.status || "UNKNOWN").toUpperCase(), verifiedAt: new Date(), sanitizedReason: null,
            providerReportsNoPaidFunds: providerReportsNoPaidFunds(provider.amountPaid),
        });
        if (observed.conflicting || observed.paymentState === "MISMATCH") return { outcome: "MISMATCH" };
        if (observed.paymentState === "PAID") {
            await this.markCancelledPaidReview(input.attemptId);
            await this.persistReconciliationOutcome({ targetType: PAYMENT_RECONCILIATION_TARGET_TYPE.PENDING_CHECKOUT, targetId: input.pendingCheckoutId, pendingCheckoutId: input.pendingCheckoutId, providerOrderCode: Number(attempt.providerOrderCode), paymentLinkId: attempt.providerLinkId, expectedAmount: attempt.expectedAmountVnd, expectedCurrency: PAYMENT_CURRENCY.VND, localStatus: "CANCEL_PENDING", requestedBy: null }, PAYMENT_RECONCILIATION_OUTCOME.MISMATCH, "Payment was verified after cancellation intent; operator resolution is required.", provider);
            return { outcome: "PENDING", cancelSentAt: input.cancelSentAt, verifyOnly: true };
        }
        if (["CANCELLED", "CANCELED", "EXPIRED"].includes(String(provider.status || "").toUpperCase())) {
            const terminalEvidenceMatches = provider.orderCode === Number(attempt.providerOrderCode)
                && toNonNegativeSafeInteger(provider.amount) === attempt.expectedAmountVnd
                && provider.currency === PAYMENT_CURRENCY.VND
                && providerReportsNoPaidFunds(provider.amountPaid)
                && Boolean(provider.paymentLinkId)
                && (!attempt.providerLinkId || attempt.providerLinkId === provider.paymentLinkId);
            if (!terminalEvidenceMatches) return { outcome: "MISMATCH" };
            await this.finishCancellationWindow(input.pendingCheckoutId, input.attemptId, false);
            return { outcome: "PENDING", cancelSentAt: input.cancelSentAt, verifyOnly: true };
        }

        if (Date.now() >= requestedAt.getTime() + 10 * 60 * 1000) {
            await this.finishCancellationWindow(input.pendingCheckoutId, input.attemptId, true);
            return { outcome: "PENDING", cancelSentAt: input.cancelSentAt, verifyOnly: true };
        }
        if (!input.verifyOnly && !input.cancelSentAt && (attempt.providerLinkId || provider.paymentLinkId)) {
            return { outcome: "CANCEL_REQUIRED", paymentLinkId: attempt.providerLinkId || provider.paymentLinkId };
        }
        return { outcome: "PENDING", cancelSentAt: input.cancelSentAt, verifyOnly: Boolean(input.verifyOnly) };
    }

    async cancelPayOSLinkForTask(input: { pendingCheckoutId: number; attemptId: string; paymentLinkId?: string }) {
        if (!this.paymentAttemptService || !this.payosService) return { outcome: "UNAVAILABLE" };
        const attempt = await this.paymentAttemptService.getCancellationTaskAttempt(input.attemptId);
        if (!attempt || attempt.pendingCheckoutId !== input.pendingCheckoutId) return { outcome: "MISMATCH" };
        if (attempt.orderState === "CREATED") return { outcome: "MATCHED" };
        const requestedAt = attempt.cancelRequestedAt ? new Date(attempt.cancelRequestedAt) : new Date();
        if (Date.now() >= requestedAt.getTime() + 10 * 60 * 1000) {
            await this.finishCancellationWindow(input.pendingCheckoutId, input.attemptId, true);
            return { outcome: "PENDING", verifyOnly: true, cancelSentAt: null };
        }
        const paymentLinkId = attempt.providerLinkId || input.paymentLinkId;
        if (!paymentLinkId) return { outcome: "PENDING", verifyOnly: true, cancelSentAt: null };
        let cancellation: Partial<PayOSPaymentLookup> & { id?: string };
        try {
            cancellation = await this.payosService.cancelPaymentLink(paymentLinkId, "Customer requested checkout cancellation") as Partial<PayOSPaymentLookup> & { id?: string };
        } catch {
            return { outcome: "PENDING", verifyOnly: true, cancelSentAt: new Date().toISOString() };
        }
        const cancelStatus = String(cancellation.status || "").toUpperCase();
        if (cancelStatus === "PAID") {
            const cancelObservation = {
                orderCode: cancellation.orderCode,
                paymentLinkId: cancellation.paymentLinkId || cancellation.id,
                amount: cancellation.amount,
                amountPaid: cancellation.amountPaid,
                status: cancellation.status,
            };
            const projection = await this.processAttemptObservation(attempt, {
                source: "LOOKUP", sourceKey: sha256(JSON.stringify(cancelObservation)), payload: cancelObservation,
                providerOrderCode: cancellation.orderCode == null ? null : String(cancellation.orderCode),
                providerLinkId: cancelObservation.paymentLinkId == null ? null : String(cancelObservation.paymentLinkId),
                reportedAmountVnd: toNonNegativeSafeInteger(cancellation.amount), paidAmountVnd: toNonNegativeSafeInteger(cancellation.amountPaid),
                currency: null, normalizedStatus: cancelStatus, verifiedAt: new Date(), sanitizedReason: null,
            });
            if (projection.paymentState === "PAID" && !projection.conflicting) {
                await this.markCancelledPaidReview(input.attemptId);
                await this.persistReconciliationOutcome({ targetType: PAYMENT_RECONCILIATION_TARGET_TYPE.PENDING_CHECKOUT, targetId: input.pendingCheckoutId, pendingCheckoutId: input.pendingCheckoutId, providerOrderCode: Number(attempt.providerOrderCode), paymentLinkId: paymentLinkId, expectedAmount: attempt.expectedAmountVnd, expectedCurrency: PAYMENT_CURRENCY.VND, localStatus: "CANCEL_PENDING", requestedBy: null }, PAYMENT_RECONCILIATION_OUTCOME.MISMATCH, "Payment was verified after cancellation intent; operator resolution is required.", cancellation as PayOSPaymentLookup);
            }
        }
        return { outcome: "PENDING", verifyOnly: true, cancelSentAt: new Date().toISOString() };
    }

    private async finishCancellationWindow(pendingCheckoutId: number, attemptId: string, reviewRequired: boolean): Promise<boolean> {
        if (!this.paymentAttemptService) return false;
        return withTransaction(async (tx) => {
            const attempt = await this.repository.getPaymentAttemptForUpdate(tx, attemptId);
            if (!attempt || attempt.pendingCheckoutId !== pendingCheckoutId || !attempt.cancelRequestedAt || attempt.orderId != null) return false;
            if (attempt.paymentState === "PAID" || attempt.verifiedReceivedAmountVnd > 0) {
                await this.repository.markPaymentAttemptReviewRequired(tx, attemptId);
                return false;
            }
            await this.paymentAttemptService!.releaseCancelledCheckout(pendingCheckoutId, tx);
            if (reviewRequired) await this.repository.markPaymentAttemptReviewRequired(tx, attemptId);
            return true;
        });
    }

    private async markCancelledPaidReview(attemptId: string) {
        await withTransaction(async (tx) => {
            const attempt = await this.repository.getPaymentAttemptForUpdate(tx, attemptId);
            if (!attempt || !attempt.cancelRequestedAt || attempt.orderId != null) return;
            await this.repository.markPaymentAttemptReviewRequired(tx, attemptId);
        });
    }

    private async reopenCancelledPaymentRecovery(attemptId: string, webhookEventId: number) {
        if (!this.tasksService) throw new Error("PayOS recovery task service is unavailable");
        await withTransaction(async (tx) => {
            const attempt = await this.repository.getPaymentAttemptForUpdate(tx, attemptId);
            if (!attempt || !attempt.cancelRequestedAt || attempt.orderId != null) return;
            const now = new Date();
            const cancelRequestedAt = attempt.cancelRequestedAt instanceof Date
                ? attempt.cancelRequestedAt.toISOString()
                : new Date(String(attempt.cancelRequestedAt)).toISOString();
            await this.repository.markPaymentAttemptReviewRequired(tx, attemptId);
            await this.tasksService!.enqueuePayOSWebhookRecovery(
                tx,
                attemptId,
                webhookEventId,
                {
                    attemptId,
                    pendingCheckoutId: attempt.pendingCheckoutId,
                    generation: 0,
                    expiresAt: now.toISOString(),
                    operation: "CANCEL",
                    cancelRequestedAt,
                    cancelSentAt: now.toISOString(),
                    verifyOnly: true,
                },
                new Date(now.getTime() + 15_000),
            );
        });
    }

    async confirmCod(paymentId: number, input: { note?: string } = {}, requestedBy?: string | null) {
        return withTransaction(async (tx) => {
            const payment = await this.repository.getOrderPaymentForUpdate(tx, paymentId);
            if (!payment) throw adminPaymentError("Payment not found", HTTP_STATUS.NOT_FOUND);
            if (String(payment.provider).toLowerCase() !== PAYMENT_PROVIDER.CASH) throw adminPaymentError("Only cash payments can be confirmed as COD", HTTP_STATUS.CONFLICT);
            const currentStatus = String(payment.status).toLowerCase();
            if (![PAYMENT_STATUS.PENDING, PAYMENT_STATUS.PAID].some((status) => status === currentStatus)) throw adminPaymentError("COD payment is not pending or paid", HTTP_STATUS.CONFLICT);
            const confirmed = await this.repository.confirmCashPayment(tx, paymentId);
            if (!confirmed) throw adminPaymentError("Payment not found", HTTP_STATUS.NOT_FOUND);
            await this.repository.recordAttempt(tx, { provider: PAYMENT_PROVIDER.CASH, orderPaymentId: paymentId, requestedBy: requestedBy || null, outcome: PAYMENT_RECONCILIATION_STATUS.MANUAL_CONFIRMED, localStatus: String(payment.status), providerStatus: PAYMENT_PROVIDER_STATUS.CASH_COLLECTED, expectedAmount: toIntegerOrNull(payment.amount), expectedCurrency: String(payment.currency || "").toUpperCase() || null, mismatchReason: normalizeNote(input.note) });
            return confirmed;
        });
    }

    async listWebhookEvents(paymentId: number) {
        return withTransaction(async (tx) => {
            const payment = await this.repository.getOrderPaymentForUpdate(tx, paymentId);
            if (!payment) throw adminPaymentError("Payment not found", HTTP_STATUS.NOT_FOUND);
            return this.repository.listWebhookEvents(tx, paymentId);
        });
    }

    private async reconcilePendingCheckout(pendingCheckoutId: number, requestedBy: string | null, throwUnavailable: boolean) {
        const checkout = await withTransaction((tx) => this.repository.getPendingCheckoutForUpdate(tx, pendingCheckoutId));
        if (!checkout) throw adminPaymentError("Payment not found", HTTP_STATUS.NOT_FOUND);
        if (String(checkout.payment_provider).toLowerCase() !== PAYMENT_PROVIDER.PAYOS) throw adminPaymentError("Payment cannot be reconciled with PayOS", HTTP_STATUS.CONFLICT);
        return this.reconcilePayOSTarget({ targetType: PAYMENT_RECONCILIATION_TARGET_TYPE.PENDING_CHECKOUT, targetId: pendingCheckoutId, pendingCheckoutId, providerOrderCode: toPositiveSafeInteger(checkout.provider_order_code), paymentLinkId: checkout.provider_reference ? String(checkout.provider_reference) : null, expectedAmount: Number(checkout.payment_amount), expectedCurrency: String(checkout.payment_currency || "").toUpperCase(), localStatus: String(checkout.status || ""), requestedBy, throwUnavailable });
    }

    private async reconcilePayOSTarget(target: PayOSTarget & { throwUnavailable: boolean }) {
        if (!this.payosService) throw adminPaymentError("PayOS payments are not configured", HTTP_STATUS.SERVICE_UNAVAILABLE);
        const identifier = target.providerOrderCode ? { orderCode: target.providerOrderCode } : (target.paymentLinkId ? { paymentLinkId: target.paymentLinkId } : null);
        if (!identifier) throw adminPaymentError("Payment has no PayOS provider reference", HTTP_STATUS.CONFLICT);
        let provider: PayOSPaymentLookup;
        try { provider = await this.payosService.getPaymentLink(identifier); }
        catch { const result = await this.persistReconciliationOutcome(target, PAYMENT_RECONCILIATION_OUTCOME.UNAVAILABLE, "PayOS provider lookup was unavailable."); if (target.throwUnavailable) throw adminPaymentError("PayOS provider is unavailable", HTTP_STATUS.SERVICE_UNAVAILABLE, result); return result; }
        const attempt = target.providerOrderCode == null ? null : await this.findPaymentAttempt(target.providerOrderCode);
        if (attempt) {
            const projection = await this.processAttemptObservation(attempt, {
                source: "LOOKUP",
                sourceKey: sha256(JSON.stringify({ orderCode: provider.orderCode, paymentLinkId: provider.paymentLinkId, amount: provider.amount, amountPaid: provider.amountPaid, status: provider.status })),
                payload: { orderCode: provider.orderCode, paymentLinkId: provider.paymentLinkId, amount: provider.amount, amountPaid: provider.amountPaid, status: provider.status },
                providerOrderCode: String(provider.orderCode),
                providerLinkId: provider.paymentLinkId,
                reportedAmountVnd: toNonNegativeSafeInteger(provider.amount),
                paidAmountVnd: toNonNegativeSafeInteger(provider.amountPaid),
                // The SDK adapter supplies VND as a normalized currency, not as independent PayOS evidence.
                currency: null,
                normalizedStatus: String(provider.status || "UNKNOWN").toUpperCase(),
                verifiedAt: new Date(),
                sanitizedReason: null,
                providerReportsNoPaidFunds: providerReportsNoPaidFunds(provider.amountPaid),
            });
            const providerStatus = String(provider.status || "UNKNOWN").toUpperCase();
            if (["CANCELLED", "CANCELED", "EXPIRED"].includes(providerStatus)) {
                const terminalEvidenceMatches = target.targetType === PAYMENT_RECONCILIATION_TARGET_TYPE.PENDING_CHECKOUT
                    && target.pendingCheckoutId != null
                    && target.expectedCurrency === PAYMENT_CURRENCY.VND
                    && provider.orderCode === target.providerOrderCode
                    && toNonNegativeSafeInteger(provider.amount) === target.expectedAmount
                    && provider.currency === PAYMENT_CURRENCY.VND
                    && providerReportsNoPaidFunds(provider.amountPaid)
                    && Boolean(provider.paymentLinkId)
                    && (!attempt.providerLinkId || attempt.providerLinkId === provider.paymentLinkId);
                if (!terminalEvidenceMatches || projection.conflicting || projection.paymentState === "MISMATCH") {
                    return this.persistReconciliationOutcome(target, PAYMENT_RECONCILIATION_OUTCOME.MISMATCH,
                        "PayOS cancellation evidence does not exactly match the checkout attempt.", provider);
                }
                if (projection.paymentState === "PAID") {
                    return this.persistReconciliationOutcome(target, PAYMENT_RECONCILIATION_OUTCOME.MISMATCH,
                        "PayOS reports cancellation after a verified receipt; operator resolution is required.", provider);
                }
                if (["CANCELLED", "EXPIRED"].includes(projection.paymentState)) {
                    const released = await this.finishCancellationWindow(target.pendingCheckoutId!, attempt.id, false);
                    if (released) return this.persistReconciliationOutcome(target, PAYMENT_RECONCILIATION_OUTCOME.PENDING, null, provider);
                    return this.persistReconciliationOutcome(target, PAYMENT_RECONCILIATION_OUTCOME.MISMATCH,
                        "PayOS cancellation could not release the checkout because payment state changed.", provider);
                }
            }
            if (projection.paymentState === "PENDING") {
                return this.persistReconciliationOutcome(target, PAYMENT_RECONCILIATION_OUTCOME.PENDING, null, provider);
            }
            if (projection.paymentState !== "PAID" || projection.conflicting) {
                const reason = "PayOS payment evidence does not exactly match the checkout attempt.";
                return this.persistReconciliationOutcome(target, PAYMENT_RECONCILIATION_OUTCOME.MISMATCH, reason, provider);
            }
            if (attempt.cancelRequestedAt) {
                return this.persistReconciliationOutcome(target, PAYMENT_RECONCILIATION_OUTCOME.MISMATCH,
                    "Verified PayOS payment arrived after cancellation intent and requires operator resolution.", provider);
            }
        }
        const mismatchReason = attempt ? null : comparePayOSPayment(target, provider);
        if (mismatchReason) return this.persistReconciliationOutcome(target, PAYMENT_RECONCILIATION_OUTCOME.MISMATCH, mismatchReason, provider);
        if (!attempt && target.orderPaymentId) {
            const currentPayment = await withTransaction((tx) => this.repository.getOrderPaymentForUpdate(tx, target.orderPaymentId!));
            const localChanged = !currentPayment
                || String(currentPayment.provider).toLowerCase() !== PAYMENT_PROVIDER.PAYOS
                || toPositiveSafeInteger(currentPayment.provider_reference) !== target.providerOrderCode
                || String(currentPayment.provider_payment_id || "") !== String(target.paymentLinkId || "")
                || toIntegerOrNull(currentPayment.amount) !== toIntegerOrNull(target.expectedAmount)
                || String(currentPayment.currency || "").toUpperCase() !== target.expectedCurrency
                || String(currentPayment.status || "") !== target.localStatus;
            if (localChanged) return this.persistReconciliationOutcome(target, PAYMENT_RECONCILIATION_OUTCOME.MISMATCH, "The local order-payment changed during PayOS reconciliation.", provider);
        }
        try {
            const finalized = attempt
                ? await this.ordersService.finalizePayOSCheckout(provider.orderCode, provider.paymentLinkId, provider.amount, attempt.id)
                : await this.ordersService.finalizePayOSCheckout(provider.orderCode, provider.paymentLinkId, provider.amount);
            if (isPayOSReviewRequired(finalized)) {
                return this.persistReconciliationOutcome(target, PAYMENT_RECONCILIATION_OUTCOME.MISMATCH, `Verified PayOS receipt requires order review: ${finalized.reason}`, provider);
            }
            if (!finalized) return this.persistReconciliationOutcome(target, PAYMENT_RECONCILIATION_OUTCOME.MISMATCH, "No matching local PayOS reservation or order was found.", provider);
            const orderId = "orderId" in finalized ? finalized.orderId : finalized.id;
            let orderPaymentId = target.orderPaymentId;
            if (!orderPaymentId) {
                const payment = await withTransaction((tx) => this.repository.getOrderPaymentByOrderId(tx, Number(orderId)));
                orderPaymentId = payment?.id ? Number(payment.id) : undefined;
            }
            if (!orderPaymentId) return this.persistReconciliationOutcome(target, PAYMENT_RECONCILIATION_OUTCOME.FAILED, "Finalized PayOS order has no payment ledger row.", provider);
            return this.persistReconciliationOutcome({ ...target, pendingCheckoutId: undefined, orderPaymentId }, PAYMENT_RECONCILIATION_OUTCOME.MATCHED, null, provider);
        } catch (error) {
            const reason = safeErrorMessage(error);
            const outcome = isPayOSReservationMismatch(error) ? PAYMENT_RECONCILIATION_OUTCOME.MISMATCH : PAYMENT_RECONCILIATION_OUTCOME.FAILED;
            const result = await this.persistReconciliationOutcome(target, outcome, reason, provider);
            if (outcome === PAYMENT_RECONCILIATION_OUTCOME.FAILED) throw adminPaymentError("Unable to reconcile PayOS payment", HTTP_STATUS.INTERNAL_SERVER_ERROR, result);
            return result;
        }
    }

    private async findPaymentAttempt(providerOrderCode: number): Promise<{ id: string; pendingCheckoutId: number; providerOrderCode: string; providerLinkId: string | null; expectedAmountVnd: number; cancelRequestedAt?: string | null } | null> {
        if (!this.paymentAttemptService) return null;
        return withTransaction((tx) => this.repository.findPaymentAttemptByProviderOrderCode(tx, String(providerOrderCode)));
    }

    private processAttemptObservation(
        attempt: { id: string; providerOrderCode: string; providerLinkId: string | null; expectedAmountVnd: number },
        observation: Omit<PaymentAttemptObservationInput, "attemptId" | "expectedAmountVnd" | "verified">,
    ): Promise<PaymentAttemptProjection> {
        if (!this.paymentAttemptService) throw new Error("Payment attempt observation service is unavailable");
        return this.paymentAttemptService.recordObservation({
            ...observation,
            attemptId: attempt.id,
            expectedAmountVnd: attempt.expectedAmountVnd,
            verified: true,
        });
    }

    private persistReconciliationOutcome(target: PayOSTarget & { orderPaymentId?: number }, outcome: PaymentReconciliationOutcome, reason: string | null, provider?: PayOSPaymentLookup) {
        return withTransaction(async (tx) => {
            await this.repository.recordAttempt(tx, { provider: PAYMENT_PROVIDER.PAYOS, pendingCheckoutId: target.pendingCheckoutId, orderPaymentId: target.orderPaymentId, requestedBy: target.requestedBy, outcome, localStatus: target.localStatus, providerStatus: provider?.status || null, expectedAmount: toIntegerOrNull(target.expectedAmount), providerAmount: provider ? toIntegerOrNull(provider.amount) : null, expectedCurrency: target.expectedCurrency || null, providerCurrency: provider?.currency || null, providerReference: provider?.paymentLinkId || null, mismatchReason: reason });
            if (outcome === PAYMENT_RECONCILIATION_OUTCOME.MATCHED && target.orderPaymentId) await this.repository.projectReconciliation(tx, { orderPaymentId: target.orderPaymentId, reconciliationStatus: outcome, providerStatus: provider?.status || null, error: reason });
            return { targetType: target.targetType, targetId: target.targetId, ...(target.orderPaymentId ? { paymentId: target.orderPaymentId } : {}), outcome, ...(reason ? { error: reason } : {}) };
        });
}
}
