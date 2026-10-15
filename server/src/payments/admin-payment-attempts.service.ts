import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { withTransaction } from "../database/transaction";
import type { TransactionContext } from "../database/transaction";
import { EvidenceService } from "../operations/evidence.service";
import { NestOrdersService } from "../orders/orders.service";
import { PaymentAttemptService } from "./payment-attempt.service";
import { AdminPaymentAttemptsRepository } from "./admin-payment-attempts.repository";

const PAGE_DEFAULT = 25;
const PAGE_MAX = 100;
const PAGE_MAX_INDEX = Math.floor(Number.MAX_SAFE_INTEGER / PAGE_MAX);

@Injectable()
export class AdminPaymentAttemptsService {
    constructor(
        private readonly repository: AdminPaymentAttemptsRepository,
        private readonly paymentAttempts: PaymentAttemptService,
        private readonly evidence: EvidenceService,
        private readonly orders: NestOrdersService,
    ) {}

    listExceptions(input: { page?: number; limit?: number }) {
        const page = Math.min(PAGE_MAX_INDEX, Math.max(1, Math.floor(input.page || 1)));
        const limit = Math.min(PAGE_MAX, Math.max(1, Math.floor(input.limit || PAGE_DEFAULT)));
        return withTransaction((tx) => this.repository.listExceptions(tx, { page, limit }));
    }

    async getException(attemptId: string) {
        const detail = await withTransaction((tx) => this.repository.getExceptionDetail(tx, attemptId));
        if (!detail) throw new NotFoundException("Paid payment exception not found");
        return detail;
    }

    async retryFulfillment(attemptId: string, actorId: string, reason: string) {
        const audit = await withTransaction(async (tx) => {
            const attempt = await this.repository.lockAttemptForResolution(tx, attemptId);
            if (!attempt) throw new NotFoundException("Payment attempt not found");
            if (attempt.provider !== "payos" || attempt.paymentState !== "PAID" || attempt.orderState === "CREATED"
                || !["NONE", "OPEN"].includes(attempt.resolutionState)
                || attempt.orderId != null || attempt.cancelRequestedAt || !attempt.providerLinkId
                || attempt.verifiedReceivedAmountVnd !== attempt.expectedAmountVnd) {
                throw new ConflictException("Payment attempt is not eligible for fulfillment retry");
            }
            const refunds = await this.repository.lockRefundSummary(tx, attemptId);
            if (!refunds || refunds.orderId != null || refunds.refundedAmountVnd > 0) {
                throw new ConflictException("Payment attempt with an order or refund cannot be retried");
            }
            await this.repository.recordAdminRetry(tx, {
                pendingCheckoutId: attempt.pendingCheckoutId,
                providerLinkId: attempt.providerLinkId,
                expectedAmountVnd: attempt.expectedAmountVnd,
                receivedAmountVnd: attempt.verifiedReceivedAmountVnd,
            }, actorId, reason.trim());
            return attempt;
        });

        return this.orders.finalizePayOSCheckout(
            Number(audit.providerOrderCode), audit.providerLinkId as string, audit.verifiedReceivedAmountVnd, audit.id,
        );
    }

    async recordRefund(attemptId: string, actorId: string, input: {
        amountVnd: number;
        transferReference: string;
        idempotencyKey: string;
        transferredAt: Date;
        evidenceId: number;
        reason: string;
    }) {
        await this.evidence.readForAdmin(input.evidenceId, actorId);
        const normalized = { ...input, transferReference: input.transferReference.trim(), reason: input.reason.trim() };
        return withTransaction(async (tx: TransactionContext) => {
            const prior = await this.repository.getRefundByIdempotency(tx, normalized.idempotencyKey);
            if (prior) {
                if (prior.attemptId !== attemptId || prior.amountVnd !== normalized.amountVnd
                    || prior.transferReference !== normalized.transferReference
                    || prior.transferredAt !== normalized.transferredAt.toISOString().slice(0, 10)
                    || prior.evidenceId !== normalized.evidenceId || prior.actorId !== actorId || prior.reason !== normalized.reason) {
                    throw new ConflictException("Refund idempotency key was reused with different details");
                }
                const balance = await this.repository.lockRefundSummary(tx, attemptId);
                if (!balance) throw new NotFoundException("Payment attempt not found");
                const resolutionState = balance.resolutionState === "RESOLVED" || balance.refundedAmountVnd >= balance.receivedAmountVnd
                    ? "RESOLVED"
                    : "OPEN";
                return { operationId: prior.operationId, amountVnd: prior.amountVnd, replayed: true, resolutionState };
            }

            const balance = await this.repository.lockRefundSummary(tx, attemptId);
            if (!balance || balance.provider !== "payos" || balance.resolutionState === "RESOLVED"
                || !["PAID", "MISMATCH"].includes(balance.paymentState) || balance.orderId != null
                || balance.receivedAmountVnd <= balance.refundedAmountVnd) {
                throw new ConflictException("Only paid attempts without an order can use this refund path");
            }
            const result = await this.paymentAttempts.recordRefund({
                attemptId,
                amountVnd: normalized.amountVnd,
                transferReference: normalized.transferReference,
                idempotencyKey: normalized.idempotencyKey,
                transferredAt: normalized.transferredAt,
                evidenceId: normalized.evidenceId,
                actorId,
                reason: normalized.reason,
            }, tx);
            const updatedBalance = await this.repository.lockRefundSummary(tx, attemptId);
            if (!updatedBalance) throw new NotFoundException("Payment attempt not found");
            const fullyRefunded = updatedBalance.refundedAmountVnd >= updatedBalance.receivedAmountVnd;
            await this.repository.setResolutionState(tx, attemptId, fullyRefunded ? "RESOLVED" : "OPEN");
            return { ...result, resolutionState: fullyRefunded ? "RESOLVED" : "OPEN" };
        });
    }
}
