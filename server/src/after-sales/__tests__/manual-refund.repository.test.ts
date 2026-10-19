import { describe, expect, it, vi } from "vitest";

const { poolQuery } = vi.hoisted(() => ({ poolQuery: vi.fn() }));

vi.mock("#src/config/database.config", () => ({ default: { query: poolQuery } }));

import { ManualRefundRepository } from "../manual-refund.repository";
import type { TransactionContext } from "../../database/transaction";

describe("ManualRefundRepository public request references", () => {
    it("converts a public request ID to its numeric key before locking and calculating the refund", async () => {
        const publicId = "019a2b3c-4d5e-7f80-8123-456789abcdef";
        const tx = {
            query: vi.fn()
                .mockResolvedValueOnce([{ id: 71, order_id: 42 }])
                .mockResolvedValueOnce([{
                    id: 42,
                    currency: "VND",
                    discount: 0,
                    pricing_snapshot: null,
                    contact_snapshot: null,
                    guest_email: "buyer@example.test",
                    guest_name: "Buyer",
                    contact_email: "buyer@example.test",
                    contact_name: "Buyer",
                }])
                .mockResolvedValueOnce([{
                    id: 71,
                    order_id: 42,
                    status: "RECEIVED",
                    reason: "Damaged item",
                    refund_amount: null,
                    refund_currency: null,
                    refund_reference: null,
                }])
                .mockResolvedValueOnce([{
                    id: 8,
                    status: "paid",
                    amount: 30000,
                    refunded_amount: 0,
                    currency: "VND",
                    simulated: 0,
                    paid_at: "2026-10-19T00:00:00Z",
                }])
                .mockResolvedValueOnce([{
                    order_item_id: 6,
                    quantity: 3,
                    total_price: 30000,
                    unit_price_snapshot: 10000,
                    requested_quantity: 1,
                }])
                .mockResolvedValueOnce([]),
        };
        const repository = new ManualRefundRepository();

        await expect(repository.getContextForUpdate(tx as unknown as TransactionContext, publicId))
            .resolves.toMatchObject({ request: { id: 71, orderId: 42 }, order: { id: 42 }, payment: { id: 8 } });

        expect(tx.query.mock.calls[0][0]).toContain("FROM after_sales_requests WHERE public_id = ? LIMIT 1");
        expect(tx.query.mock.calls[0][1]).toEqual([publicId]);
        expect(tx.query.mock.calls[2][0]).toContain("FROM after_sales_requests WHERE id = ? AND order_id = ? LIMIT 1 FOR UPDATE");
        expect(tx.query.mock.calls[2][1]).toEqual([71, 42]);
        expect(tx.query.mock.calls[4][1]).toEqual([71, 42]);
    });
});
