import { describe, expect, it, vi } from "vitest";
import { SupportController } from "../support.controller";
import { SupportTicketService } from "../support.service";
import { supportTicketCreateSchema } from "../support.validator";

describe("SupportController", () => {
    it("creates a ticket with the authenticated owner", async () => {
        const service = {
            createTicket: vi.fn().mockResolvedValue({ id: 1, status: "OPEN" }),
        } as unknown as SupportTicketService;
        const controller = new SupportController(service);

        await expect(controller.createTicket(
            { user: { id: "user-1", role: "customer" } } as never,
            { subject: "Order issue", message: "Please help" },
        )).resolves.toMatchObject({ ticket: { id: 1 } });
        expect(service.createTicket).toHaveBeenCalledWith("user-1", {
            subject: "Order issue",
            message: "Please help",
        });
    });

    it("rejects an empty message", () => {
        expect(() => supportTicketCreateSchema.parse({ subject: "x", message: "" })).toThrow();
    });
});
