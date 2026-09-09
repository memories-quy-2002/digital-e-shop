import { beforeEach, describe, expect, it, vi } from "vitest";
import http from "../../lib/http";
import { fetchAnalyticsSummary } from "./api";

vi.mock("../../lib/http", () => ({
    default: {
        get: vi.fn(),
    },
}));

describe("dashboard analytics API", () => {
    beforeEach(() => vi.clearAllMocks());

    it("passes the selected range to the analytics endpoint", async () => {
        vi.mocked(http.get).mockResolvedValue({ data: { summary: {} } } as never);

        await fetchAnalyticsSummary("7d");

        expect(http.get).toHaveBeenCalledWith("/api/analytics/summary", { params: { range: "7d" } });
    });
});
