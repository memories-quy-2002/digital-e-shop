import { describe, expect, it, vi } from "vitest";
import { PaymentReconciliationRepository } from "../payment-reconciliation.repository";

type Query = ReturnType<typeof vi.fn>;
const buildTx = (query: Query) => ({ query });

describe("PaymentReconciliationRepository", () => {
    it("claims a new event and returns a same-payload duplicate without conflicting", async () => {
        const tx = buildTx(vi.fn().mockResolvedValueOnce({ insertId: 7, affectedRows: 1 }).mockResolvedValueOnce([{ id: 7, status: "RECEIVED", payload_hash: "hash-1" }]));
        const repository = new PaymentReconciliationRepository();
        await expect(repository.claimWebhookEvent(tx as never, { provider: "payos", eventKey: "event-1", eventType: "PAYMENT_SUCCESS", payloadHash: "hash-1", normalizedPayload: { orderCode: 123456 }, orderCode: 123456, paymentLinkId: "link-123", amount: 250000, currency: "VND" })).resolves.toEqual({ inserted: true, eventId: 7, status: "RECEIVED", payloadHashMatches: true });

        const duplicate = buildTx(vi.fn().mockResolvedValueOnce({ affectedRows: 0 }).mockResolvedValueOnce([{ id: 7, status: "PROCESSED", payload_hash: "hash-1" }]));
        await expect(repository.claimWebhookEvent(duplicate as never, { provider: "payos", eventKey: "event-1", eventType: "PAYMENT_SUCCESS", payloadHash: "hash-1", normalizedPayload: { orderCode: 123456 } })).resolves.toMatchObject({ inserted: false, eventId: 7, status: "PROCESSED", payloadHashMatches: true });
        expect(duplicate.query.mock.calls[0][0]).toContain("ON DUPLICATE KEY UPDATE");
    });

    it("returns a payload conflict for a reused event key with a different hash", async () => {
        const tx = buildTx(vi.fn().mockResolvedValueOnce({ affectedRows: 0 }).mockResolvedValueOnce([{ id: 7, status: "PROCESSED", payload_hash: "different-hash" }]));
        const repository = new PaymentReconciliationRepository();
        await expect(repository.claimWebhookEvent(tx as never, { provider: "payos", eventKey: "event-1", eventType: "PAYMENT_SUCCESS", payloadHash: "hash-1", normalizedPayload: {} })).resolves.toMatchObject({ inserted: false, conflict: true, payloadHashMatches: false });
    });

    it("bounds candidate pagination and does not select guest token hashes", async () => {
        const tx = buildTx(vi.fn().mockResolvedValueOnce([{ total: 101 }]).mockResolvedValueOnce([]));
        const repository = new PaymentReconciliationRepository();
        await expect(repository.listCandidates({ page: 3, limit: 999, provider: "payos" }, tx as never)).resolves.toMatchObject({ candidates: [], pagination: { page: 3, limit: 100, total: 101, totalPages: 2 } });
        const sql = String(tx.query.mock.calls[1][0]);
        expect(sql).toContain("LIMIT ? OFFSET ?");
        expect(sql).not.toContain("guest_order_token_hash");
        expect(tx.query.mock.calls[1][1]).toEqual(["payos", 100, 200]);
    });
});