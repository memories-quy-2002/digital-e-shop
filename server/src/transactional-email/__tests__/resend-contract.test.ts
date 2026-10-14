import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EmailWebhookService } from "../email-webhook.service";
import { ResendEmailProvider } from "../resend.provider";

describe("Resend maintained SDK contracts (local signed fixtures)", () => {
    afterEach(() => vi.unstubAllGlobals());
    it("verifies an actual fixture signature, rejects body tampering and persists failed delivery", async () => {
        const key = Buffer.from("local-fixture-signing-key-32bytes");
        const webhookSecret = `whsec_${key.toString("base64")}`;
        const body = JSON.stringify({ type: "email.failed", created_at: new Date().toISOString(), data: { email_id: "fixture-provider-email" } });
        const id = "fixture-event-1", timestamp = String(Math.floor(Date.now() / 1000));
        const signature = `v1,${createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64")}`;
        const repository = { recordDeliveryEvent: vi.fn().mockResolvedValue({ kind: "queued", eventId: 1 }) };
        const service = new EmailWebhookService(repository as never, { mode: "resend", apiKey: "re_local_fixture", webhookSecret });
        await expect(service.accept(body, { id, timestamp, signature })).resolves.toEqual({ kind: "queued", eventId: 1 });
        expect(repository.recordDeliveryEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: "email.failed", providerMessageId: "fixture-provider-email" }));
        await expect(service.accept(body.replace("email.failed", "email.delivered"), { id, timestamp, signature })).rejects.toThrow();
    });
    it("attaches a cancellable request and the immutable provider idempotency key", async () => {
        const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "fixture-email" }), { status: 200, headers: { "Content-Type": "application/json" } }));
        vi.stubGlobal("fetch", fetcher);
        const provider = new ResendEmailProvider({ mode: "resend", apiKey: "re_local_fixture", fromAddress: "shop@example.test" });
        await expect(provider.send({ eventKey: "fixture-key", locale: "en", to: ["buyer@example.test"], subject: "Receipt", text: "Receipt", html: "<p>Receipt</p>" }, "fixture-key")).resolves.toEqual({ kind: "accepted", providerMessageId: "fixture-email" });
        expect(fetcher.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
        expect(new Headers(fetcher.mock.calls[0][1].headers).get("Idempotency-Key")).toBe("fixture-key");
    });
});
