import { describe, expect, it, vi } from "vitest";
import type { TransactionContext } from "../database/transaction";
import { completeDeliveredOrder } from "./order-delivery";

const transaction = (internalAssignment: boolean): TransactionContext => ({
    query: vi.fn(async (sql: string) => {
        if (sql.includes("SELECT status, delivery_snapshot FROM orders")) return [{ status: 0, delivery_snapshot: { provider: "INTERNAL" } }] as never;
        if (sql.includes("SELECT id, provider, status, simulated FROM order_payments")) return [{ id: 1, provider: "payos", status: "paid", simulated: 0 }] as never;
        if (sql.includes("SELECT state, provider FROM shipments")) return [{ state: "READY_TO_SHIP", provider: "INTERNAL" }] as never;
        if (sql.includes("FROM delivery_assignments")) return internalAssignment ? [{ id: 5 }] as never : [] as never;
        return { affectedRows: 1, insertId: 1 } as never;
    }),
});

describe("completeDeliveredOrder internal delivery gate", () => {
    it("completes an internal order only after a delivery assignment is marked delivered", async () => {
        const tx = transaction(true);
        await expect(completeDeliveredOrder(tx, 42, new Date("2026-10-17T03:00:00Z"), "driver-1")).resolves.toBe(true);
        expect(tx.query).toHaveBeenCalledWith(expect.stringContaining("delivery_assignments"), [42]);
    });

    it("keeps an internal order pending when no delivered assignment exists", async () => {
        const tx = transaction(false);
        await expect(completeDeliveredOrder(tx, 42, new Date(), "driver-1")).rejects.toThrow(/internal delivery must be verified/i);
        expect(tx.query).not.toHaveBeenCalledWith(expect.stringContaining("UPDATE orders"), expect.anything());
    });
});
