import { createHash, randomInt, randomUUID } from "node:crypto";
import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { withTransaction } from "../database/transaction";
import type { TransactionContext } from "../database/transaction";
import { CURRENCY_CODE } from "#src/shared/constants/currency";
import { PaymentAttemptClaimCollisionError, PaymentAttemptOrderCodeCollisionError, PaymentAttemptRepository } from "./payment-attempt.repository";
import { PAYMENT_ATTEMPT_ORDER_STATE, PAYMENT_ATTEMPT_PAYMENT_STATE, PAYMENT_ATTEMPT_RESOLUTION_STATE } from "./payment-attempt.types";
import type {
    PaymentAttemptCreateLease,
    PaymentAttemptClaim,
    PaymentAttemptClaimInput,
    PaymentAttemptFindClaimInput,
    PaymentAttemptObservationInput,
    PaymentAttemptObservationResult,
    PaymentAttemptProviderLink,
    PaymentAttemptOwnedStatusInput,
    PaymentAttemptRefundInput,
    PaymentAttemptRefundResult,
    PaymentAttemptStatus,
    PaymentAttemptTransaction,
} from "./payment-attempt.types";

const ORDER_CODE_ATTEMPTS = 5;
function canonicalize(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (value && typeof value === "object") {
        return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, nested]) => [key, canonicalize(nested)]));
    }
    return value;
}

function hash(value: unknown): string {
    return createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}

function assertSafeVnd(amount: number, label: string, allowZero = false): void {
    if (!Number.isSafeInteger(amount) || (allowZero ? amount < 0 : amount <= 0)) {
        throw new ConflictException(`${label} must be a safe whole-number VND amount`);
    }
}

function ownerScope(owner: PaymentAttemptClaimInput["owner"]): string {
    if (owner.kind === "authenticated") {
        if (!owner.userId || owner.userId.length > 255) throw new ConflictException("Invalid payment attempt owner");
        return `user:${owner.userId}`;
    }
    if (!owner.guestCartId) throw new ConflictException("Invalid payment attempt owner");
    return `guest:${createHash("sha256").update(owner.guestCartId).digest("hex")}`;
}

function sanitizeSnapshot(snapshot: PaymentAttemptClaimInput["snapshot"]): PaymentAttemptClaimInput["snapshot"] {
    const items = snapshot.items.map((item) => {
        if (!Number.isSafeInteger(item.productId) || item.productId <= 0 || !Number.isSafeInteger(item.quantity) || item.quantity <= 0) {
            throw new ConflictException("Invalid payment attempt item snapshot");
        }
        assertSafeVnd(item.unitPriceVnd, "Item price");
        return { productId: item.productId, name: String(item.name).slice(0, 255), quantity: item.quantity, unitPriceVnd: item.unitPriceVnd };
    });
    const delivery = snapshot.delivery
        ? { method: String(snapshot.delivery.method).slice(0, 64), ...(snapshot.delivery.eta == null ? {} : { eta: String(snapshot.delivery.eta).slice(0, 100) }) }
        : undefined;
    return { items, subtotalVnd: snapshot.subtotalVnd, discountVnd: snapshot.discountVnd, shippingVnd: snapshot.shippingVnd, ...(delivery ? { delivery } : {}) };
}

@Injectable()
export class PaymentAttemptService {
    constructor(private readonly repository: PaymentAttemptRepository) {}

    async findExistingClaim(input: PaymentAttemptFindClaimInput, tx?: PaymentAttemptTransaction): Promise<PaymentAttemptClaim | null> {
        if (!input.idempotencyKey || input.idempotencyKey.length > 191) throw new ConflictException("Invalid idempotency key");
        const scope = ownerScope(input.owner);
        const keyHash = hash(input.idempotencyKey);
        const requestHash = hash(input.request);
        const work = async (transaction: TransactionContext): Promise<PaymentAttemptClaim | null> => {
            const existing = await this.repository.findClaimByOwnerAndKey(transaction, scope, keyHash);
            return existing ? this.replay(existing, requestHash) : null;
        };
        return tx ? work(tx) : withTransaction(work);
    }

    async claim(input: PaymentAttemptClaimInput, tx?: PaymentAttemptTransaction): Promise<PaymentAttemptClaim> {
        if (!input.idempotencyKey || input.idempotencyKey.length > 191) throw new ConflictException("Invalid idempotency key");
        assertSafeVnd(input.expectedAmountVnd, "Expected amount");
        const snapshot = sanitizeSnapshot(input.snapshot);
        for (const amount of [snapshot.subtotalVnd, snapshot.discountVnd, snapshot.shippingVnd]) assertSafeVnd(amount, "Checkout total", true);
        const expectedFromSnapshot = snapshot.subtotalVnd - snapshot.discountVnd + snapshot.shippingVnd;
        if (expectedFromSnapshot !== input.expectedAmountVnd) throw new ConflictException("Payment attempt snapshot total does not match expected amount");
        if (!Number.isSafeInteger(input.pendingCheckoutId) || input.pendingCheckoutId <= 0) throw new ConflictException("Invalid pending checkout");

        const scope = ownerScope(input.owner);
        const idempotencyKeyHash = hash(input.idempotencyKey);
        const snapshotHash = hash(snapshot);
        const canonicalRequestHash = hash(input.request);
        const work = async (transaction: TransactionContext): Promise<PaymentAttemptClaim> => {
            const existing = await this.repository.findClaim(transaction, scope, idempotencyKeyHash);
            if (existing) return this.replay(existing, canonicalRequestHash);

            const id = randomUUID();
            const claim = { id, ownerScope: scope, idempotencyKeyHash, requestHash: canonicalRequestHash, snapshotHash, pendingCheckoutId: input.pendingCheckoutId,
                expectedAmountVnd: input.expectedAmountVnd, expiresAt: input.expiresAt, snapshot };
            for (let attempt = 0; attempt < ORDER_CODE_ATTEMPTS; attempt += 1) {
                const providerOrderCode = String(randomInt(1, Number.MAX_SAFE_INTEGER));
                try {
                    const inserted = await this.repository.insertClaim(transaction, { ...claim, providerOrderCode });
                    return { ...inserted, requestHash: canonicalRequestHash, replayed: false };
                } catch (error) {
                    if (error instanceof PaymentAttemptClaimCollisionError) {
                        const racedClaim = await this.repository.findClaim(transaction, scope, idempotencyKeyHash);
                        if (racedClaim) return this.replay(racedClaim, canonicalRequestHash);
                        throw new ConflictException("Payment attempt is already linked to a checkout reservation");
                    }
                    if (!(error instanceof PaymentAttemptOrderCodeCollisionError)) throw error;
                    if (attempt === ORDER_CODE_ATTEMPTS - 1) throw new ConflictException("Unable to allocate a unique PayOS order code");
                }
            }
            throw new ConflictException("Unable to allocate a unique PayOS order code");
        };
        return tx ? work(tx) : withTransaction(work);
    }

    async recordObservation(input: PaymentAttemptObservationInput, tx?: PaymentAttemptTransaction): Promise<PaymentAttemptObservationResult> {
        assertSafeVnd(input.expectedAmountVnd, "Expected amount");
        if (input.reportedAmountVnd != null) assertSafeVnd(input.reportedAmountVnd, "Reported amount", true);
        if (input.paidAmountVnd != null) assertSafeVnd(input.paidAmountVnd, "Paid amount", true);
        if (!input.sourceKey || input.sourceKey.length > 255) throw new ConflictException("Invalid payment observation key");
        const payloadHash = hash(input.payload);
        const work = (transaction: TransactionContext) => this.repository.recordObservation(transaction, { ...input, payloadHash });
        return tx ? work(tx) : withTransaction(work);
    }

    async acquireCreateLease(input: PaymentAttemptCreateLease, tx?: PaymentAttemptTransaction): Promise<boolean> {
        const leaseDurationMs = input.leaseUntil.getTime() - Date.now();
        if (!input.attemptId || !input.leaseToken || input.leaseToken.length > 36 || !Number.isFinite(leaseDurationMs)
            || leaseDurationMs <= 0 || leaseDurationMs > 30_000) {
            throw new ConflictException("Invalid payment attempt create lease");
        }
        const work = (transaction: TransactionContext) => this.repository.acquireCreateLease(transaction, input.attemptId, input.leaseToken, input.leaseUntil);
        return tx ? work(tx) : withTransaction(work);
    }

    async saveProviderLink(input: PaymentAttemptProviderLink, tx?: PaymentAttemptTransaction): Promise<boolean> {
        assertSafeVnd(input.amountVnd, "Provider amount");
        if (!input.providerOrderCode || !/^[1-9]\d*$/.test(input.providerOrderCode)
            || !input.providerLinkId || input.providerLinkId.length > 255 || !input.providerLinkUrl) {
            throw new ConflictException("Invalid PayOS link binding");
        }
        const code = Number(input.providerOrderCode);
        if (!Number.isSafeInteger(code)) throw new ConflictException("Provider order code exceeds the safe integer range");
        const work = (transaction: TransactionContext) => this.repository.saveProviderLink(transaction, input);
        return tx ? work(tx) : withTransaction(work);
    }

    async getOwnedStatus(input: PaymentAttemptOwnedStatusInput, tx?: PaymentAttemptTransaction): Promise<PaymentAttemptStatus> {
        const scope = ownerScope(input.owner);
        const work = async (transaction: TransactionContext): Promise<PaymentAttemptStatus> => {
            const row = await this.repository.getOwnedStatus(transaction, input.attemptId, scope);
            if (!row) throw new NotFoundException("Payment attempt not found");
            const id = String(row.id);
            const providerOrderCode = String(row.providerOrderCode);
            const snapshot = row.snapshot as { items?: PaymentAttemptStatus["items"]; delivery?: PaymentAttemptStatus["delivery"]; subtotalVnd?: number; discountVnd?: number; shippingVnd?: number };
            return {
                attemptId: id,
                providerOrderCode,
                paymentState: row.paymentState,
                orderState: row.orderState,
                resolutionState: row.resolutionState,
                orderId: row.orderId == null ? null : Number(row.orderId),
                items: Array.isArray(snapshot?.items) ? snapshot.items : [],
                delivery: snapshot?.delivery ?? null,
                subtotalVnd: Number(snapshot?.subtotalVnd ?? 0),
                discountVnd: Number(snapshot?.discountVnd ?? 0),
                shippingVnd: Number(snapshot?.shippingVnd ?? 0),
                payableVnd: Number(row.expectedAmountVnd),
                currency: CURRENCY_CODE.VND,
                expiresAt: new Date(row.expiresAt).toISOString(),
                lastCheckedAt: row.lastCheckedAt ? new Date(row.lastCheckedAt).toISOString() : null,
                retryAfterSeconds: row.retryAfterSeconds == null ? null : Number(row.retryAfterSeconds),
                supportReference: `PAY-${id.slice(0, 8).toUpperCase()}`,
                resumeUrl: typeof row.providerLinkUrl === "string" ? row.providerLinkUrl : null,
            };
        };
        return tx ? work(tx) : withTransaction(work);
    }

    async recordRefund(input: PaymentAttemptRefundInput, tx?: PaymentAttemptTransaction): Promise<PaymentAttemptRefundResult> {
        assertSafeVnd(input.amountVnd, "Refund amount");
        if (!input.transferReference || input.transferReference.length > 191) throw new ConflictException("Invalid transfer reference");
        const work = async (transaction: TransactionContext): Promise<PaymentAttemptRefundResult> => {
            const prior = await this.repository.findRefundByIdempotency(transaction, input.idempotencyKey);
            if (prior) {
                if (prior.attemptId !== input.attemptId || prior.amountVnd !== input.amountVnd || prior.transferReference !== input.transferReference) {
                    throw new ConflictException("Refund idempotency key was reused with different details");
                }
                return { operationId: prior.operationId, amountVnd: prior.amountVnd };
            }
            const balance = await this.repository.lockRefundBalance(transaction, input.attemptId);
            if (!balance || balance.orderId != null) throw new ConflictException("Only paid attempts without an order can use this refund path");
            const racedPrior = await this.repository.findRefundByIdempotency(transaction, input.idempotencyKey);
            if (racedPrior) {
                if (racedPrior.attemptId !== input.attemptId || racedPrior.amountVnd !== input.amountVnd || racedPrior.transferReference !== input.transferReference) {
                    throw new ConflictException("Refund idempotency key was reused with different details");
                }
                return { operationId: racedPrior.operationId, amountVnd: racedPrior.amountVnd };
            }
            if (input.amountVnd > balance.verifiedReceivedAmountVnd - balance.refundedAmountVnd) throw new ConflictException("Refund exceeds verified received funds");
            return this.repository.insertRefund(transaction, input);
        };
        return tx ? work(tx) : withTransaction(work);
    }

    private replay(existing: PaymentAttemptClaim, requestHash: string): PaymentAttemptClaim {
        if (existing.requestHash !== requestHash) throw new ConflictException("Idempotency key was already used for a different checkout request");
        return { ...existing, replayed: true };
    }
}

export const PAYMENT_ATTEMPT_DEFAULT_STATES = {
    payment: PAYMENT_ATTEMPT_PAYMENT_STATE.PENDING,
    order: PAYMENT_ATTEMPT_ORDER_STATE.NOT_CREATED,
    resolution: PAYMENT_ATTEMPT_RESOLUTION_STATE.NONE,
} as const;
