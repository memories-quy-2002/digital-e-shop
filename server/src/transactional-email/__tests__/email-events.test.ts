import { describe, expect, it, vi } from "vitest";
import { GUARDS_METADATA } from "@nestjs/common/constants";
import { AuthGuard } from "../../guards/auth.guard";
import { RolesGuard, ROLES_KEY } from "../../guards/roles.guard";
import { EmailWebhookService } from "../email-webhook.service";
import { AdminEmailController } from "../admin-email.controller";
import { TransactionalEmailRepository } from "../email.repository";

const transactionQuery = vi.hoisted(() => vi.fn());
vi.mock("../../database/transaction", () => ({ withTransaction: (work: (tx: unknown) => unknown) => work({ query: transactionQuery }) }));

const event = { type: "email.delivered", created_at: "2026-10-14T00:00:00.000Z", data: { email_id: "re_123", message_id: "<mail-123>" } };

describe("signed Resend delivery events", () => {
    it("passes the exact raw body to maintained verification before persisting", async () => {
        const repository = { recordDeliveryEvent: vi.fn().mockResolvedValue({ kind: "queued", eventId: 8 }) };
        const service = new EmailWebhookService(repository as never, { mode: "resend", apiKey: "key", webhookSecret: "secret" },
            (body) => { expect(body).toBe('{"type":"email.delivered"}'); return event as never; });
        await expect(service.accept('{"type":"email.delivered"}', { id: "evt_1", timestamp: "1", signature: "sig" }))
            .resolves.toEqual({ kind: "queued", eventId: 8 });
        expect(repository.recordDeliveryEvent).toHaveBeenCalledWith(expect.objectContaining({
            providerEventId: "evt_1", providerMessageId: "re_123", eventType: "email.delivered",
        }));
    });

    it("rejects missing configuration, invalid signatures, and changed bodies", async () => {
        const repository = { recordDeliveryEvent: vi.fn() };
        const missing = new EmailWebhookService(repository as never, { mode: "disabled" });
        await expect(missing.accept("{}", { id: "evt_1", timestamp: "1", signature: "sig" })).rejects.toThrow();
        const invalid = new EmailWebhookService(repository as never, { mode: "resend", apiKey: "key", webhookSecret: "secret" });
        await expect(invalid.accept('{"type":"email.delivered"}', { id: "evt_1", timestamp: "1", signature: "bad" })).rejects.toThrow();
        expect(repository.recordDeliveryEvent).not.toHaveBeenCalled();
    });

    it("ignores unknown event types, retries an unmapped message, and deduplicates callbacks", async () => {
        const repository = { recordDeliveryEvent: vi.fn().mockResolvedValueOnce({ kind: "ignored" }).mockResolvedValueOnce({ kind: "ignored" }).mockResolvedValueOnce({ kind: "duplicate", eventId: 8 }) };
        const service = new EmailWebhookService(repository as never, { mode: "resend", apiKey: "key", webhookSecret: "secret" }, () => event as never);
        const headers = { id: "evt_1", timestamp: "1", signature: "sig" };
        await expect(service.accept("{}", headers)).rejects.toMatchObject({ status: 503 });
        await expect(service.accept("{}", { ...headers, id: "evt_2" })).rejects.toMatchObject({ status: 503 });
        await expect(service.accept("{}", headers)).resolves.toEqual({ kind: "duplicate", eventId: 8 });
    });

    it("requires role-protected admin message operations", () => {
        const handler = AdminEmailController.prototype.list;
        expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toEqual([AuthGuard, RolesGuard]);
        expect(Reflect.getMetadata(ROLES_KEY, handler)).toEqual(["admin"]);
    });
});

describe("email delivery persistence", () => {
    it("inserts the event and only transitions a currently accepted email", async () => {
        transactionQuery.mockReset()
            .mockResolvedValueOnce([{ id: 22 }])
            .mockResolvedValueOnce({ affectedRows: 1 })
            .mockResolvedValueOnce([{ id: 8, email_id: 22, payload_hash: "a".repeat(64) }])
            .mockResolvedValueOnce({ affectedRows: 1 });
        const repository = new TransactionalEmailRepository();
        await expect(repository.recordDeliveryEvent({ providerEventId: "evt_1", providerMessageId: "re_123", eventType: "email.delivered", payloadHash: "a".repeat(64) }))
            .resolves.toEqual({ kind: "queued", eventId: 8 });
        expect(transactionQuery.mock.calls[3][0]).toContain("state = 'ACCEPTED'");
    });

    it("deduplicates an existing provider event without updating the email again", async () => {
        transactionQuery.mockReset()
            .mockResolvedValueOnce([{ id: 22 }])
            .mockResolvedValueOnce({ affectedRows: 0 })
            .mockResolvedValueOnce([{ id: 8, email_id: 22, payload_hash: "a".repeat(64) }]);
        const repository = new TransactionalEmailRepository();
        await expect(repository.recordDeliveryEvent({ providerEventId: "evt_1", providerMessageId: "re_123", eventType: "email.delivered", payloadHash: "a".repeat(64) }))
            .resolves.toEqual({ kind: "duplicate", eventId: 8 });
        expect(transactionQuery).toHaveBeenCalledTimes(3);
    });
});
