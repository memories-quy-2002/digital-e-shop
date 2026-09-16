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
        expect(tx.query.mock.calls[1][1]).toEqual(["payos", "payos", 100, 200]);
    });
    it("matches finalized PayOS payments by webhook order code and payment-link ID", async () => {
        const tx = buildTx(vi.fn().mockResolvedValue([{ id: 9, order_code: 123456, payment_link_id: "link-123" }]));
        const repository = new PaymentReconciliationRepository();
        await expect(repository.listWebhookEvents(tx as never, 42)).resolves.toEqual([{ id: 9, order_code: 123456, payment_link_id: "link-123" }]);
        const sql = String(tx.query.mock.calls[0][0]);
        expect(sql).toContain("op.provider_reference = CAST(e.order_code AS CHAR)");
        expect(sql).toContain("op.provider_payment_id = e.payment_link_id");
        expect(sql).not.toContain("op.provider_reference = e.payment_link_id");
        expect(tx.query.mock.calls[0][1]).toEqual([42]);
    });

    it("keeps payment-link IDs as string lookup values", async () => {
        const tx = buildTx(vi.fn().mockResolvedValue([{ id: 10, payment_link_id: "000123" }]));
        const repository = new PaymentReconciliationRepository();
        await expect(repository.listWebhookEvents(tx as never, 43)).resolves.toEqual([{ id: 10, payment_link_id: "000123" }]);
        expect(tx.query.mock.calls[0][1]).toEqual([43]);
        expect(String(tx.query.mock.calls[0][0])).toContain("e.payment_link_id");
    });

    it.each([
        { name: "an absent reconciliation status", reconciliationStatus: undefined, expectedValues: ["cash", "cash", 50, 0] },
        { name: "PENDING", reconciliationStatus: "PENDING", expectedValues: ["cash", "PENDING", "cash", 50, 0] },
        { name: "CONSUMED", reconciliationStatus: "CONSUMED", expectedValues: ["cash", "CONSUMED", "cash", 50, 0] },
        { name: "PAID", reconciliationStatus: "PAID", expectedValues: ["cash", "PAID", "cash", 50, 0] },
    ])("keeps pending candidates restricted to PENDING for $name while filtering order payments by reconciliation status", async ({ reconciliationStatus, expectedValues }) => {
        const tx = buildTx(vi.fn().mockResolvedValueOnce([{ total: 0 }]).mockResolvedValueOnce([]));
        const repository = new PaymentReconciliationRepository();
        await repository.listCandidates({ provider: "cash", ...(reconciliationStatus ? { reconciliationStatus } : {}) }, tx as never);
        const countSql = String(tx.query.mock.calls[0][0]);
        const listSql = String(tx.query.mock.calls[1][0]);
        for (const sql of [countSql, listSql]) {
            expect(sql).toContain("op.provider = ?");
            expect(sql).toContain("pc.payment_provider = ?");
            expect(sql).toContain("pc.status = 'PENDING'");
            expect(sql).toContain("FROM order_payments op");
            expect(sql).toContain("FROM pending_checkouts pc");
            expect(sql).not.toContain("pc.payment_provider = 'payos'");
            if (reconciliationStatus) {
                expect(sql).toContain("op.reconciliation_status = ?");
            } else {
                expect(sql).not.toContain("op.reconciliation_status = ?");
            }
            if (reconciliationStatus && reconciliationStatus !== "PENDING") {
                expect(sql).toContain("1 = 0");
                expect(sql).not.toContain("pc.status = ?");
            } else {
                expect(sql).not.toContain("1 = 0");
            }
        }
        expect(tx.query.mock.calls[0][1]).toEqual(expectedValues.slice(0, -2));
        expect(tx.query.mock.calls[1][1]).toEqual(expectedValues);
    });
});
