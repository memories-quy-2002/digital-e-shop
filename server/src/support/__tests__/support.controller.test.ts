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

    it("accepts UUID v7 linked order references and rejects other UUID versions", () => {
        const orderId = "019a2b3c-4d5e-7f80-8123-456789abcdef";
        expect(supportTicketCreateSchema.parse({ subject: "Order issue", message: "Please help", orderId }).orderId).toBe(orderId);
        expect(() => supportTicketCreateSchema.parse({ subject: "Order issue", message: "Please help", orderId: "019a2b3c-4d5e-4f80-8123-456789abcdef" })).toThrow();
    });

    it("resolves a UUID v7 route reference without changing the legacy response envelope", async () => {
        const publicId = "019a2b3c-4d5e-7f80-8123-456789abcdef";
        const service = {
            updateTicket: vi.fn().mockResolvedValue({ id: 1, public_id: publicId, status: "RESOLVED" }),
        } as unknown as SupportTicketService;
        const controller = new SupportController(service);

        await expect(controller.updateTicket(publicId, { status: "RESOLVED" })).resolves.toMatchObject({
            ticket: { id: 1, public_id: publicId },
            msg: "Support ticket updated successfully",
        });
        expect(service.updateTicket).toHaveBeenCalledWith(publicId, { status: "RESOLVED" });
    });

    it("rejects an unsupported UUID version as a bad request", async () => {
        const service = { updateTicket: vi.fn() } as unknown as SupportTicketService;
        const controller = new SupportController(service);

        await expect(controller.updateTicket("019a2b3c-4d5e-4f80-8123-456789abcdef", { status: "RESOLVED" }))
            .rejects.toMatchObject({ status: 400 });
        expect(service.updateTicket).not.toHaveBeenCalled();
    });
});
