import { describe, expect, it, vi } from "vitest";

const { poolQuery } = vi.hoisted(() => ({ poolQuery: vi.fn() }));

vi.mock("#src/config/database.config", () => ({ default: { query: poolQuery } }));

import { AfterSalesRepository } from "../after-sales.repository";
import type { TransactionContext } from "../../database/transaction";

const publicId = "019a2b3c-4d5e-7f80-8123-456789abcdef";
const ticketRow = (status = "REQUESTED") => ({
    id: 71,
    public_id: publicId,
    order_id: 42,
    user_id: "customer-1",
    kind: "RETURN",
    status,
    reason: "Damaged item",
    admin_note: null,
    refund_amount: null,
    refund_currency: null,
    refund_reference: null,
    created_at: "2026-10-19T00:00:00.000Z",
    updated_at: "2026-10-19T00:00:00.000Z",
    approved_at: null,
    received_at: null,
    refunded_at: null,
    closed_at: null,
});

describe("AfterSalesRepository public IDs", () => {
    it("resolves public order IDs with the existing ownership predicate", async () => {
        const tx = { query: vi.fn().mockResolvedValue([{ id: 42, status: 1 }]) };
        const repository = new AfterSalesRepository();

        await expect(repository.findOrderForIdentity(tx as unknown as TransactionContext, {
            orderId: publicId,
            userId: "customer-1",
        })).resolves.toMatchObject({ id: 42 });

        expect(tx.query).toHaveBeenCalledWith(
            expect.stringContaining("FROM orders WHERE public_id = ? AND user_id = ? LIMIT 1 FOR UPDATE"),
            [publicId, "customer-1"],
        );
    });

    it("inserts a request public ID while keeping item and event foreign keys numeric", async () => {
        const tx = {
            query: vi.fn()
                .mockResolvedValueOnce({ insertId: 71 })
                .mockResolvedValueOnce({ insertId: 81 })
                .mockResolvedValueOnce({ insertId: 91 })
                .mockResolvedValueOnce([ticketRow()]),
        };
        const repository = new AfterSalesRepository();
        const input = {
            orderId: 42,
            kind: "RETURN" as const,
            reason: "Damaged item",
            items: [{ orderItemId: 6, quantity: 1 }],
            idempotencyKey: "return-42-1",
        };
        const item = { id: 6, orderId: 42, productId: 3, quantity: 1, unitPrice: 100, totalPrice: 100, productName: "Hub", sku: "HUB", warrantyMonths: 12 };

        await expect(repository.insertRequest(tx as unknown as TransactionContext, { userId: "customer-1" }, input, [item]))
            .resolves.toMatchObject({ id: 71, publicId, orderId: 42 });

        const [insertSql, insertValues] = tx.query.mock.calls[0] as [string, unknown[]];
        expect(insertSql).toContain("INSERT INTO after_sales_requests");
        expect(insertSql).toContain("(public_id, order_id, user_id");
        expect(insertValues[0]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
        expect(insertValues.slice(1)).toEqual([42, "customer-1", null, "RETURN", "Damaged item", "return-42-1"]);
        expect(tx.query.mock.calls[1][1]).toEqual([71, 6, 1, null]);
        expect(tx.query.mock.calls[2][1]).toEqual([71, "customer-1", "Damaged item"]);
        expect(tx.query.mock.calls[3][1]).toEqual([71]);
    });

    it("mutates and writes status events by the resolved numeric request key", async () => {
        const tx = {
            query: vi.fn()
                .mockResolvedValueOnce([ticketRow()])
                .mockResolvedValueOnce({ affectedRows: 1 })
                .mockResolvedValueOnce({ insertId: 92 })
                .mockResolvedValueOnce([ticketRow("APPROVED")]),
        };
        const repository = new AfterSalesRepository();

        await expect(repository.transitionRequest(tx as unknown as TransactionContext, publicId, { status: "APPROVED" }, "admin-1"))
            .resolves.toMatchObject({ id: 71, publicId, status: "APPROVED" });

        expect(tx.query.mock.calls[0][0]).toContain("WHERE r.public_id = ? LIMIT 1 FOR UPDATE");
        expect(tx.query.mock.calls[0][1]).toEqual([publicId]);
        expect(tx.query.mock.calls[1][0]).toContain("UPDATE after_sales_requests SET status = ?");
        expect(tx.query.mock.calls[1][0]).toContain("WHERE id = ?");
        expect(tx.query.mock.calls[1][1]).toEqual(["APPROVED", null, 71]);
        expect(tx.query.mock.calls[2][0]).toContain("INSERT INTO after_sales_events");
        expect(tx.query.mock.calls[2][1]).toEqual([71, "REQUESTED", "APPROVED", "admin-1", null]);
        expect(tx.query.mock.calls[3][1]).toEqual([71]);
    });

    it("keeps customer ownership in UUID detail lookups", async () => {
        poolQuery.mockImplementation((_sql: unknown, _values: unknown[], callback: (error: null, rows: unknown[]) => void) => {
            callback(null, []);
        });
        const repository = new AfterSalesRepository();

        await repository.getCustomerRequest("customer-1", publicId);

        expect(poolQuery.mock.calls[0][0]).toContain("WHERE r.public_id = ? AND r.user_id = ? LIMIT 1");
        expect(poolQuery.mock.calls[0][1]).toEqual([publicId, "customer-1"]);
    });
});
