import { beforeEach, describe, expect, it, vi } from "vitest";
import http from "../../lib/http";
import { createSupportTicket, fetchSupportTickets, updateSupportTicket } from "./api";

vi.mock("../../lib/http", () => ({
    default: {
        get: vi.fn(),
        post: vi.fn(),
        patch: vi.fn(),
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

    it("updates support tickets by public identifier", async () => {
        const publicId = "019a0000-0000-7000-8000-000000000003";
        vi.mocked(http.patch).mockResolvedValue({ data: { ticket: { id: 7, public_id: publicId, status: "RESOLVED" } } } as never);
        await expect(updateSupportTicket(publicId, { status: "RESOLVED" })).resolves.toMatchObject({ id: 7, public_id: publicId });
        expect(http.patch).toHaveBeenCalledWith(`/api/support/tickets/${publicId}`, { status: "RESOLVED" });
    });
});
