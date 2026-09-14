import { describe, expect, it, vi } from "vitest";

const poolQuery = vi.hoisted(() => vi.fn());

vi.mock("#src/config/database.config", () => ({
    default: { query: poolQuery },
}));

import { NestAnalyticsService } from "../analytics.service";

describe("admin analytics reporting scope", () => {
    it("excludes canceled orders from financial trend metrics and exposes guest-cart funnel data", async () => {
        poolQuery.mockImplementation((config: string | { sql: string }, _params: unknown[], callback: (error: null, rows: unknown[]) => void) => {
            const sql = typeof config === "string" ? config : config.sql;
            callback(null, sql.includes("FROM guest_carts")
                ? [{ active_carts: 3, active_items: 7, abandoned_carts: 2, converted_carts: 4, expired_carts: 1 }]
                : [{}]);
        });

        const result = await new NestAnalyticsService().getAnalyticsSummary({ range: "30d" });
        const sqlByMatch = (match: string) => {
            const call = poolQuery.mock.calls.find(([config]) => {
                const sql = typeof config === "string" ? config : config?.sql;
                return String(sql || "").includes(match);
            });
            const config = call?.[0];
            return String(typeof config === "string" ? config : config?.sql || "");
        };

        expect(sqlByMatch("gross_revenue")).toContain("status <> 2");
        expect(sqlByMatch("average_order_value")).toContain("status = 1");
        expect(sqlByMatch("completed_orders")).toContain("o.status <> 2");
        expect(result.summary.operations.guestCarts).toEqual({
            active: 3,
            activeItems: 7,
            abandoned: 2,
            converted: 4,
            expired: 1,
        });
    });
});
