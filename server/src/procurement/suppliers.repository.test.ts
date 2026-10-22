import { beforeEach, describe, expect, it, vi } from "vitest";

const { poolQuery } = vi.hoisted(() => ({ poolQuery: vi.fn() }));
vi.mock("#src/config/database.config", () => ({ default: { query: poolQuery } }));

import { SuppliersRepository } from "./suppliers.repository";

const callbackAt = (args: unknown[]) => args.findLast((value) => typeof value === "function") as ((error: Error | null, rows: unknown) => void) | undefined;

describe("SuppliersRepository.list", () => {
    beforeEach(() => poolQuery.mockReset());

    it("parameterizes filters, escapes LIKE metacharacters, and returns pagination", async () => {
        poolQuery.mockImplementation((...args: unknown[]) => {
            const sql = String(args[0]);
            callbackAt(args)?.(null, sql.includes("COUNT(*)") ? [{ total: 1 }] : [{
                id: 7, code: "ACME", name: "Acme", contact_name: null, email: null, phone: null, address: null, notes: null,
                active: 1, version: 2, created_at: "2026-10-21T00:00:00Z", updated_at: "2026-10-21T00:00:00Z",
            }]);
        });
        const repository = new SuppliersRepository();

        const result = await repository.list(2, 10, "50%_!", "active");

        expect(result.items[0]).toMatchObject({ id: 7, code: "ACME", active: true, version: 2 });
        expect(result.pagination).toEqual({ page: 2, limit: 10, total: 1, totalPages: 1 });
        const [countSql, countValues] = poolQuery.mock.calls[0] as [string, unknown[]];
        expect(countSql).toContain("active = ?");
        expect(countSql).toContain("LOWER(code) LIKE ? ESCAPE '!'");
        expect(countValues).toEqual([1, "%50!%!_!!%", "%50!%!_!!%", "%50!%!_!!%"]);
        expect((poolQuery.mock.calls[1] as [string, unknown[]])[1]).toEqual([...countValues, 10, 10]);
    });
});
