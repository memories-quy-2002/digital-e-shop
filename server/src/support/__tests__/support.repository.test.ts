import { beforeEach, describe, expect, it, vi } from "vitest";

const { poolQuery } = vi.hoisted(() => ({ poolQuery: vi.fn() }));

vi.mock("#src/config/database.config", () => ({ default: { query: poolQuery } }));

import { SupportTicketRepository } from "../support.repository";

const uuidV7Pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const callbackAt = (args: unknown[]) => args.findLast((value) => typeof value === "function") as ((error: Error | null, rows: unknown) => void) | undefined;

describe("SupportTicketRepository public IDs", () => {
    beforeEach(() => poolQuery.mockReset());

    it("inserts a generated public ID and resolves a UUID v7 order through public_id", () => {
        poolQuery.mockImplementation((...args: unknown[]) => {
            callbackAt(args)?.(null, { insertId: 19, affectedRows: 1 });
        });
        const repository = new SupportTicketRepository();
        const orderPublicId = "019a2b3c-4d5e-7f80-8123-456789abcdef";
        const callback = vi.fn();

        repository.create("customer-1", {
            orderId: orderPublicId,
            subject: "Order issue",
            message: "Please help",
        }, callback);

        const [sql, values] = poolQuery.mock.calls[0] as [string, unknown[]];
        expect(sql).toContain("INSERT INTO support_tickets");
        expect(sql).toContain("FROM orders WHERE public_id = ? AND user_id = ?");
        expect(values[0]).toMatch(uuidV7Pattern);
        expect(values).toEqual([values[0], "customer-1", "general", "Order issue", "Please help", orderPublicId, "customer-1"]);
        expect(callback).toHaveBeenCalledWith(null, { insertId: 19, affectedRows: 1 });
    });

    it("selects and updates by a public reference with the reference bound as a value", () => {
        poolQuery.mockImplementation((...args: unknown[]) => callbackAt(args)?.(null, []));
        const repository = new SupportTicketRepository();
        const publicId = "019a2b3c-4d5e-7f80-8123-456789abcdef";
        const callback = vi.fn();

        repository.findById(publicId, callback);
        repository.update(publicId, { status: "RESOLVED" }, callback);

        expect(poolQuery.mock.calls[0][0]).toContain("FROM support_tickets WHERE public_id = ? LIMIT 1");
        expect(poolQuery.mock.calls[0][1]).toEqual([publicId]);
        expect(poolQuery.mock.calls[1][0]).toContain("UPDATE support_tickets SET status = ?, updated_at = UTC_TIMESTAMP() WHERE public_id = ?");
        expect(poolQuery.mock.calls[1][1]).toEqual(["RESOLVED", publicId]);
    });
});
