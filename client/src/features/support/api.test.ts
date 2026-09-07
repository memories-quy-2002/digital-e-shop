import { beforeEach, describe, expect, it, vi } from "vitest";
import http from "../../lib/http";
import { createSupportTicket, fetchSupportTickets } from "./api";

vi.mock("../../lib/http", () => ({
    default: {
        get: vi.fn(),
        post: vi.fn(),
    },
}));

describe("support API", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("creates a support ticket through the authenticated API", async () => {
        vi.mocked(http.post).mockResolvedValue({ data: { ticket: { id: 7, status: "OPEN" } } } as never);

        await expect(
            createSupportTicket({ subject: "Order issue", message: "Please help", category: "order" }),
        ).resolves.toMatchObject({ id: 7, status: "OPEN" });

        expect(http.post).toHaveBeenCalledWith("/api/support/tickets", {
            subject: "Order issue",
            message: "Please help",
            category: "order",
        });
    });

    it("returns only tickets from the server response", async () => {
        vi.mocked(http.get).mockResolvedValue({ data: { tickets: [{ id: 1, status: "RESOLVED" }] } } as never);

        await expect(fetchSupportTickets()).resolves.toEqual([{ id: 1, status: "RESOLVED" }]);
        expect(http.get).toHaveBeenCalledWith("/api/support/tickets");
    });
});
