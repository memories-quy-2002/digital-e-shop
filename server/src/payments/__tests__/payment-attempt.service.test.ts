import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { PaymentAttemptRepository, PaymentAttemptOrderCodeCollisionError } from "../payment-attempt.repository";
import { PaymentAttemptService } from "../payment-attempt.service";
import { PAYMENT_ATTEMPT_PAYMENT_STATE } from "../payment-attempt.types";

const { withTransaction } = vi.hoisted(() => ({ withTransaction: vi.fn() }));
vi.mock("../../database/transaction", () => ({ withTransaction }));

type Query = ReturnType<typeof vi.fn>;
const tx = (query: Query) => ({ query });

const baseClaim = (overrides = {}) => ({
    owner: { kind: "authenticated" as const, userId: "user-1" },
    idempotencyKey: "cbb6e8cf-2e9f-4dc1-8ca5-40c11b88ed69",
    request: { items: [{ productId: 7, quantity: 2 }], quoteId: "quote-1", promotionCode: null },
    snapshot: { items: [{ productId: 7, name: "Board", quantity: 2, unitPriceVnd: 125000 }], subtotalVnd: 250000, discountVnd: 0, shippingVnd: 0 },
    pendingCheckoutId: 41,
    expectedAmountVnd: 250000,
    expiresAt: new Date("2026-10-15T10:35:00.000Z"),
    ...overrides,
});

const storedAttempt = (overrides = {}) => ({
    id: "c19a2909-53a4-4ec6-aad9-39db780e9381",
    ownerScope: "user:user-1",
    idempotencyKeyHash: "key-hash",
    requestHash: "request-hash",
    snapshotHash: "snapshot-hash",
    pendingCheckoutId: 41,
    providerOrderCode: "123456789",
    expectedAmountVnd: 250000,
    paymentState: PAYMENT_ATTEMPT_PAYMENT_STATE.PENDING,
    orderState: "NOT_CREATED",
    resolutionState: "NONE",
    ...overrides,
});

describe("PaymentAttemptService", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        withTransaction.mockImplementation(async (work: (transaction: unknown) => Promise<unknown>) => work({ query: vi.fn() }));
    });

    it("hashes canonical requests deterministically regardless of object key order", async () => {
        const repository = {
            findClaim: vi.fn().mockResolvedValue(null),
            insertClaim: vi.fn().mockResolvedValue(storedAttempt()),
        };
        const service = new PaymentAttemptService(repository as unknown as PaymentAttemptRepository);
        const first = await service.claim(baseClaim(), tx(vi.fn()) as never);
        const second = await service.claim(baseClaim({ request: { promotionCode: null, quoteId: "quote-1", items: [{ quantity: 2, productId: 7 }] } }), tx(vi.fn()) as never);
        expect(first.requestHash).toBe(second.requestHash);
    });

    it("finds an owner-scoped idempotent replay before checkout quote validation", async () => {
        const request = { quoteId: "expired-quote", items: [{ productId: 7, quantity: 2 }] };
        const existing = storedAttempt({ requestHash: createHash("sha256").update(JSON.stringify({ items: [{ productId: 7, quantity: 2 }], quoteId: "expired-quote" })).digest("hex") });
        const repository = { findClaimByOwnerAndKey: vi.fn().mockResolvedValue(existing) };
        const service = new PaymentAttemptService(repository as unknown as PaymentAttemptRepository);
        const replay = await service.findExistingClaim({
            owner: { kind: "authenticated", userId: "user-1" },
            idempotencyKey: "cbb6e8cf-2e9f-4dc1-8ca5-40c11b88ed69",
            request,
        }, tx(vi.fn()) as never);
        expect(replay).toMatchObject({ id: existing.id, replayed: true });
        expect(repository.findClaimByOwnerAndKey.mock.calls[0][1]).toBe("user:user-1");
    });

    it("rejects a changed request body in the pre-validation replay lookup", async () => {
        const repository = { findClaimByOwnerAndKey: vi.fn().mockResolvedValue(storedAttempt()) };
        const service = new PaymentAttemptService(repository as unknown as PaymentAttemptRepository);
        await expect(service.findExistingClaim({
            owner: { kind: "authenticated", userId: "user-1" },
            idempotencyKey: "cbb6e8cf-2e9f-4dc1-8ca5-40c11b88ed69",
            request: { changed: true },
        }, tx(vi.fn()) as never)).rejects.toMatchObject({ status: 409 });
    });

    it("replays the same owner, key and body without changing the immutable expected amount", async () => {
        const existing = storedAttempt();
        const repository = {
            findClaim: vi.fn().mockResolvedValue(null),
            insertClaim: vi.fn().mockImplementation((_tx, input) => ({ ...existing, ...input })),
        };
        const service = new PaymentAttemptService(repository as unknown as PaymentAttemptRepository);
        const first = await service.claim(baseClaim(), tx(vi.fn()) as never);
        repository.findClaim.mockResolvedValue(first);
        const replay = await service.claim(baseClaim(), tx(vi.fn()) as never);
        expect(replay).toMatchObject({ id: first.id, replayed: true, expectedAmountVnd: 250000 });
        expect(repository.insertClaim).toHaveBeenCalledTimes(1);
    });

    it("rejects a changed canonical body with HTTP 409", async () => {
        const repository = { findClaim: vi.fn().mockResolvedValue(storedAttempt()), insertClaim: vi.fn() };
        const service = new PaymentAttemptService(repository as unknown as PaymentAttemptRepository);
        await expect(service.claim(baseClaim({ expectedAmountVnd: 250001 }), tx(vi.fn()) as never)).rejects.toMatchObject({ status: 409 });
    });

    it("isolates the same idempotency key across different owners", async () => {
        const repository = { findClaim: vi.fn().mockResolvedValue(null), insertClaim: vi.fn().mockImplementation((_tx, input) => storedAttempt({ ...input, id: "another-attempt" })) };
        const service = new PaymentAttemptService(repository as unknown as PaymentAttemptRepository);
        const result = await service.claim(baseClaim({ owner: { kind: "authenticated", userId: "user-2" } }), tx(vi.fn()) as never);
        expect(result.id).toBe("another-attempt");
        expect(repository.insertClaim.mock.calls[0][1].ownerScope).toBe("user:user-2");
    });

    it("generates a positive safe-integer provider code and retries unique collisions at most five times", async () => {
        const repository = {
            findClaim: vi.fn().mockResolvedValue(null),
            insertClaim: vi.fn()
                .mockRejectedValueOnce(new PaymentAttemptOrderCodeCollisionError())
                .mockRejectedValueOnce(new PaymentAttemptOrderCodeCollisionError())
                .mockImplementation((_tx, input) => storedAttempt({ ...input })),
        };
        const service = new PaymentAttemptService(repository as unknown as PaymentAttemptRepository);
        const result = await service.claim(baseClaim(), tx(vi.fn()) as never);
        const code = Number(repository.insertClaim.mock.calls.at(-1)?.[1].providerOrderCode);
        expect(Number.isSafeInteger(code) && code > 0).toBe(true);
        expect(result.providerOrderCode).toBe(String(code));
        expect(repository.insertClaim).toHaveBeenCalledTimes(3);

        repository.insertClaim.mockRejectedValue(new PaymentAttemptOrderCodeCollisionError());
        await expect(service.claim(baseClaim({ idempotencyKey: "other-key" }), tx(vi.fn()) as never)).rejects.toThrow(/unique/i);
        expect(repository.insertClaim).toHaveBeenCalledTimes(8);
    });

    it("deduplicates identical observations and rejects a conflicting payload for the same source key", async () => {
        const repository = {
            recordObservation: vi.fn()
                .mockResolvedValueOnce({ id: "attempt-1", paymentState: "PAID", inserted: false, conflicting: false })
                .mockResolvedValueOnce({ id: "attempt-1", paymentState: "MISMATCH", inserted: false, conflicting: true }),
        };
        const service = new PaymentAttemptService(repository as unknown as PaymentAttemptRepository);
        const input = { attemptId: "attempt-1", source: "WEBHOOK" as const, sourceKey: "event-1", payload: { amount: 250000 }, expectedAmountVnd: 250000, reportedAmountVnd: 250000, paidAmountVnd: 250000, verifiedAt: new Date(), normalizedStatus: "PAID", verified: true };
        await expect(service.recordObservation(input, tx(vi.fn()) as never)).resolves.toMatchObject({ inserted: false, conflicting: false });
        await expect(service.recordObservation({ ...input, payload: { amount: 300000 } }, tx(vi.fn()) as never)).resolves.toMatchObject({ inserted: false, conflicting: true });
    });

    it("caps concurrent refunds against verified receipt funds inside the transaction", async () => {
        const repository = {
            findRefundByIdempotency: vi.fn().mockResolvedValue(null),
            lockRefundBalance: vi.fn().mockResolvedValue({ verifiedReceivedAmountVnd: 10000, refundedAmountVnd: 0, orderId: null }),
            insertRefund: vi.fn().mockResolvedValue({ operationId: "refund-1", amountVnd: 7000 }),
        };
        const service = new PaymentAttemptService(repository as unknown as PaymentAttemptRepository);
        const input = { attemptId: "attempt-1", transferReference: "bank-ref-1", idempotencyKey: "d0f58b2c-4d28-4c6d-935d-40af158cbbd2", amountVnd: 7000, transferredAt: new Date(), evidenceId: "evidence-1", actorId: "admin-1", reason: "Paid orphan" };
        await expect(service.recordRefund(input, tx(vi.fn()) as never)).resolves.toMatchObject({ amountVnd: 7000 });
        repository.lockRefundBalance.mockResolvedValue({ verifiedReceivedAmountVnd: 10000, refundedAmountVnd: 7000, orderId: null });
        await expect(service.recordRefund({ ...input, transferReference: "bank-ref-2", idempotencyKey: "f4d88693-a076-43a5-a49e-688245a85e84", amountVnd: 4000 }, tx(vi.fn()) as never)).rejects.toMatchObject({ status: 409 });
        expect(repository.lockRefundBalance).toHaveBeenCalledTimes(2);
    });

    it("returns no personal or provider credential data in the owned status projection", async () => {
        const repository = { getOwnedStatus: vi.fn().mockResolvedValue({ id: "attempt-1", providerOrderCode: "9007199254740990", expectedAmountVnd: 250000, expiresAt: new Date(), snapshot: { subtotalVnd: 250000, discountVnd: 0, shippingVnd: 0, items: [] }, paymentState: "PENDING", orderState: "NOT_CREATED", resolutionState: "NONE", email: "private@example.test", accessToken: "secret" }) };
        const service = new PaymentAttemptService(repository as unknown as PaymentAttemptRepository);
        const result = await service.getOwnedStatus({ attemptId: "attempt-1", owner: { kind: "authenticated", userId: "user-1" } }, tx(vi.fn()) as never);
        expect(result.providerOrderCode).toBe("9007199254740990");
        expect(JSON.stringify(result)).not.toMatch(/private@example|secret|email|token/i);
    });
});

describe("PaymentAttemptRepository.recordObservation received-funds projection", () => {
    const buildObservationTx = (paymentState: string) => {
        let callIndex = 0;
        const locked = [{ id: "attempt-1", payment_state: "PENDING", order_state: "NOT_CREATED", resolution_state: "NONE", order_id: null,
            verified_received_amount_vnd: 0, provider_order_code: "123456", provider_link_id: "link-1", expected_amount_vnd: 250000 }];
        const projected = [{ ...locked[0], payment_state: paymentState, verified_received_amount_vnd: paymentState === "PAID" ? 250000 : 0 }];
        const results = [locked, [], { affectedRows: 1 }, { affectedRows: 1 }, projected];
        return { query: vi.fn(async () => results[callIndex++]) };
    };
    const observation = (overrides = {}) => ({
        attemptId: "attempt-1", source: "WEBHOOK" as const, sourceKey: "event-1", payload: { amount: 250000 }, payloadHash: "payload-hash",
        providerOrderCode: "123456", providerLinkId: "link-1", expectedAmountVnd: 250000, currency: "VND",
        normalizedStatus: "PENDING", verified: true, ...overrides,
    });

    it("does not count a verified PENDING observation even when paidAmountVnd is non-null", async () => {
        const query = buildObservationTx("PENDING").query;
        const repository = new PaymentAttemptRepository();
        await repository.recordObservation({ query } as never, observation({ paidAmountVnd: 250000 }) as never);
        expect(query.mock.calls[3][1][3]).toBe(0);
        expect(query.mock.calls[2][1][8]).toBe(250000);
    });

    it("preserves verified overpayment as refundable funds while marking the amount mismatch", async () => {
        const query = buildObservationTx("MISMATCH").query;
        const repository = new PaymentAttemptRepository();
        const result = await repository.recordObservation({ query } as never, observation({
            payload: { amount: 250001 }, reportedAmountVnd: 250001, paidAmountVnd: 250001, normalizedStatus: "PAID",
        }) as never);
        expect(result).toMatchObject({ paymentState: "MISMATCH", conflicting: true });
        expect(query.mock.calls[2][1][8]).toBe(250001);
        expect(query.mock.calls[3][1][3]).toBe(250001);
        expect(String(query.mock.calls[3][0])).toContain("LEAST(9007199254740991, GREATEST(verified_received_amount_vnd, ?))");
    });

    it("preserves verified underpayment as the refundable cap while marking the amount mismatch", async () => {
        const query = buildObservationTx("MISMATCH").query;
        const repository = new PaymentAttemptRepository();
        const result = await repository.recordObservation({ query } as never, observation({
            payload: { amount: 200000 }, reportedAmountVnd: 200000, paidAmountVnd: 200000, normalizedStatus: "PAID",
        }) as never);
        expect(result).toMatchObject({ paymentState: "MISMATCH", conflicting: true });
        expect(query.mock.calls[2][1][8]).toBe(200000);
        expect(query.mock.calls[3][1][3]).toBe(200000);
    });

    it("counts only an exact PAID receipt matching attempt identity, code and expected VND", async () => {
        const query = buildObservationTx("PAID").query;
        const repository = new PaymentAttemptRepository();
        const result = await repository.recordObservation({ query } as never, observation({
            reportedAmountVnd: 250000, paidAmountVnd: 250000, normalizedStatus: "PAID",
        }) as never);
        expect(result).toMatchObject({ paymentState: "PAID", conflicting: false });
        expect(query.mock.calls[3][1][3]).toBe(250000);
    });

    it.each([
        ["missing provider link identity", { providerLinkId: undefined }],
        ["mismatched provider link identity", { providerLinkId: "other-link" }],
        ["missing currency", { currency: undefined }],
        ["non-VND currency", { currency: "USD" }],
    ])("does not count a PAID receipt with %s", async (_label, invalidIdentity) => {
        const query = buildObservationTx("MISMATCH").query;
        const repository = new PaymentAttemptRepository();
        const result = await repository.recordObservation({ query } as never, observation({
            reportedAmountVnd: 250000, paidAmountVnd: 250000, normalizedStatus: "PAID", ...invalidIdentity,
        }) as never);
        expect(result).toMatchObject({ paymentState: "MISMATCH", conflicting: true });
        expect(query.mock.calls[3][1][3]).toBe(0);
    });
});
