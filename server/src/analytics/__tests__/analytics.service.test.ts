import { describe, expect, it, vi } from "vitest";

const poolQuery = vi.hoisted(() => vi.fn());

vi.mock("#src/config/database.config", () => ({
    default: { query: poolQuery },
}));

import { NestAnalyticsService } from "../analytics.service";
import { AnalyticsRepository } from "../analytics.repository";
import type { AnalyticsSummaryRows } from "../analytics.types";

describe("admin analytics reporting scope", () => {
    it("excludes canceled orders from financial trend metrics and exposes guest-cart funnel data", async () => {
        poolQuery.mockImplementation((config: string | { sql: string }, _params: unknown[], callback: (error: null, rows: unknown[]) => void) => {
            const sql = typeof config === "string" ? config : config.sql;
            callback(null, sql.includes("FROM guest_carts")
                ? [{ active_carts: 3, active_items: 7, abandoned_carts: 2, converted_carts: 4, expired_carts: 1 }]
                : [{}]);
        });

        const result = await new NestAnalyticsService(new AnalyticsRepository()).getAnalyticsSummary({ range: "30d" });
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

describe("overlapping analytics summaries", () => {
    const emptyRows = (): AnalyticsSummaryRows => ({
        overviewRows: [{}], revenueTrendRows: [], categoryPerformanceRows: [], customerSegmentRows: [],
        inventoryRiskRows: [], paymentMethodRows: [], promotionCatalogRows: [], discountOrderRows: [],
        promotionPerformanceRows: [], guestCartAnalyticsRows: [],
    });

    it("shares pending rows for equivalent canonical ranges and maps a fresh response per caller", async () => {
        let resolveRows!: (rows: AnalyticsSummaryRows) => void;
        const rowPromise = new Promise<AnalyticsSummaryRows>((resolve) => { resolveRows = resolve; });
        const repository = { getSummaryRows: vi.fn(() => rowPromise) };
        const service = new NestAnalyticsService(repository as unknown as AnalyticsRepository);
        const first = service.getAnalyticsSummary({ range: "30d" });
        const second = service.getAnalyticsSummary({ range: "not-a-range" });
        await Promise.resolve();
        expect(repository.getSummaryRows).toHaveBeenCalledTimes(1);
        expect(repository.getSummaryRows).toHaveBeenCalledWith(30);
        resolveRows(emptyRows());
        const [firstResponse, secondResponse] = await Promise.all([first, second]);
        expect(firstResponse).not.toBe(secondResponse);
        expect(firstResponse.summary).not.toBe(secondResponse.summary);
        expect(firstResponse.summary.windows.range).toBe("30d");
    });

    it("isolates pending reads for different ranges", async () => {
        const resolvers: Array<(rows: AnalyticsSummaryRows) => void> = [];
        const repository = { getSummaryRows: vi.fn(() => new Promise<AnalyticsSummaryRows>((resolve) => resolvers.push(resolve))) };
        const service = new NestAnalyticsService(repository as unknown as AnalyticsRepository);
        const week = service.getAnalyticsSummary({ range: "7d" });
        const month = service.getAnalyticsSummary({ range: "30d" });
        await Promise.resolve();
        expect(repository.getSummaryRows.mock.calls.map(([days]) => days)).toEqual([7, 30]);
        resolvers[0](emptyRows());
        resolvers[1](emptyRows());
        await Promise.all([week, month]);
    });

    it("delivers a pending failure to all waiters, evicts it and retries", async () => {
        const failure = new Error("analytics unavailable");
        const repository = { getSummaryRows: vi.fn().mockRejectedValueOnce(failure).mockResolvedValue(emptyRows()) };
        const service = new NestAnalyticsService(repository as unknown as AnalyticsRepository);
        const first = service.getAnalyticsSummary({ range: "30d" });
        const second = service.getAnalyticsSummary({ range: "30d" });
        await expect(Promise.all([first, second])).rejects.toBe(failure);
        await expect(service.getAnalyticsSummary({ range: "30d" })).resolves.toMatchObject({ summary: { windows: { range: "30d" } } });
        expect(repository.getSummaryRows).toHaveBeenCalledTimes(2);
    });

    it("does not retain fulfilled rows or a synchronous repository failure", async () => {
        const repository = { getSummaryRows: vi.fn().mockResolvedValue(emptyRows()) };
        const service = new NestAnalyticsService(repository as unknown as AnalyticsRepository);
        await service.getAnalyticsSummary({});
        await service.getAnalyticsSummary({ range: "invalid" });
        expect(repository.getSummaryRows).toHaveBeenCalledTimes(2);

        const failure = new Error("synchronous failure");
        const synchronousRepository = { getSummaryRows: vi.fn().mockImplementationOnce(() => { throw failure; }).mockResolvedValue(emptyRows()) };
        const synchronousService = new NestAnalyticsService(synchronousRepository as unknown as AnalyticsRepository);
        await expect(synchronousService.getAnalyticsSummary({})).rejects.toBe(failure);
        await expect(synchronousService.getAnalyticsSummary({})).resolves.toBeDefined();
        expect(synchronousRepository.getSummaryRows).toHaveBeenCalledTimes(2);
    });
});
