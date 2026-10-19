import { describe, expect, it, vi } from "vitest";
import { EmailService } from "../email.service";
import { renderEmail, sanitizeEmailEvent } from "../email.templates";
import { createEmailProvider } from "../email.module";
import type { EmailBusinessEvent, EmailMessage } from "../email.types";
import type { TaskLease } from "../../operations/tasks.types";

const event: EmailBusinessEvent = {
    eventKey: "order-placed:42",
    type: "order_placed",
    recipient: "buyer@example.test",
    locale: "en",
    snapshot: {
        orderNumber: "DE-42",
        customerName: "<script>alert(1)</script>",
        items: [{ name: "<img src=x onerror=alert(1)>", quantity: 2 }],
        itemsSubtotal: 10000,
        merchandiseDiscount: 1000,
        shippingFee: 500,
        payableTotal: 9500,
        currency: "VND",
    },
};

const lease = (firstAttemptAt: Date, attempt = 1): TaskLease => ({
    id: 15, kind: "EMAIL_SEND", key: event.eventKey, payload: { emailId: 9 }, token: "fence-token",
    attempt, expiresAt: new Date(firstAttemptAt.getTime() + 60000), firstAttemptAt,
});

describe("transactional email", () => {
    it.each(["en", "vi"] as const)("renders a single-recipient %s email with escaped HTML", (locale) => {
        const message = renderEmail({ ...event, locale });
        expect(message.to).toEqual([event.recipient]);
        expect(message.html).not.toContain("<script>");
        expect(message.html).not.toContain("<img src=x");
        expect(message.html).toContain("&lt;script&gt;");
        expect(message.text).toContain("<script>alert(1)</script>");
        expect(message.subject).toBeTruthy();
        expect(message.eventKey).toBe(event.eventKey);
        expect(message.html).toContain("Digital-E");
        expect(message.html).toContain(locale === "vi" ? "Tóm tắt đơn hàng" : "Order summary");
        expect(message.html).toContain("× 2");
        expect(message.html).toContain(locale === "vi" ? "Tạm tính" : "Subtotal");
        expect(message.html).toContain(locale === "vi" ? "9.500 VND" : "9,500 VND");
        expect(message.html).toContain(locale === "vi" ? "Để xem thông tin đơn hàng" : "For protected order details");
    });

    it("renders every approved business event type", () => {
        const variants: EmailBusinessEvent[] = [
            event,
            { eventKey: "shipment:42:shipped", type: "shipment_update", recipient: event.recipient, locale: "vi", snapshot: {
                orderNumber: "DE-42", customerName: "Lan", status: "SHIPPED", trackingCode: "GHN-123",
            } },
            { eventKey: "cancel:42", type: "order_cancelled", recipient: event.recipient, locale: "en", snapshot: {
                orderNumber: "DE-42", customerName: "Lan", reason: "Customer request",
            } },
            { eventKey: "after-sales:3:decision", type: "after_sales_decision", recipient: event.recipient, locale: "vi", snapshot: {
                orderNumber: "DE-42", customerName: "Lan", decision: "approved", publicMessage: "Request accepted",
            } },
            { eventKey: "after-sales:3:refund", type: "refund_confirmation", recipient: event.recipient, locale: "en", snapshot: {
                orderNumber: "DE-42", customerName: "Lan", refundAmount: 3000, currency: "VND",
            } },
        ];
        for (const item of variants) {
            expect(renderEmail(item).html).toContain("<html");
            expect(renderEmail(item).to).toHaveLength(1);
        }
    });

    it("renders a localized guest order recovery email with the OTP escaped", () => {
        const message = renderEmail({
            eventKey: "guest-order-access-recovery:challenge-1",
            type: "guest_order_access_recovery",
            recipient: "buyer@example.test",
            locale: "vi",
            snapshot: { customerName: "Buyer", orderId: 42, code: "012345", expiresMinutes: 10 },
        } as EmailBusinessEvent);

        expect(message.subject).toContain("truy cập");
        expect(message.text).toContain("012345");
        expect(message.text).toContain("10");
        expect(message.html).toContain("012345");
        expect(message.to).toEqual(["buyer@example.test"]);
    });

    it("persists only the allowlisted snapshot fields", () => {
        const unsafe = { ...event, snapshot: { ...event.snapshot, guestToken: "never-persist-this", bankAccount: "private" } } as EmailBusinessEvent;
        const safe = sanitizeEmailEvent(unsafe);
        expect(safe.snapshot).not.toHaveProperty("guestToken");
        expect(safe.snapshot).not.toHaveProperty("bankAccount");
    });

    it("enqueues rendered immutable facts and an email task in the same transaction", async () => {
        const tx = { query: vi.fn() } as never;
        const repository = { enqueue: vi.fn().mockResolvedValue({ id: 9, created: true }) };
        const tasks = { enqueue: vi.fn().mockResolvedValue(15) };
        const provider = { send: vi.fn() };
        const service = new EmailService(repository as never, tasks as never, provider as never, { mode: "sandbox", fromAddress: "shop@example.test" });
        await expect(service.enqueue(tx, event)).resolves.toBe(15);
        expect(repository.enqueue).toHaveBeenCalledWith(tx, expect.objectContaining({
            eventKey: event.eventKey, recipient: event.recipient, locale: event.locale, snapshot: event.snapshot,
        }), expect.objectContaining({ eventKey: event.eventKey, to: [event.recipient] }));
        expect(tasks.enqueue).toHaveBeenCalledWith(tx, { kind: "EMAIL_SEND", key: event.eventKey, payload: { emailId: 9 } });
        expect(provider.send).not.toHaveBeenCalled();
    });

    it("sends the persisted immutable snapshot using a stable provider idempotency key", async () => {
        const message = renderEmail(event);
        const repository = {
            enqueue: vi.fn(),
            findForSend: vi.fn().mockResolvedValue({ id: 9, message, state: "PENDING" }),
            markAccepted: vi.fn().mockResolvedValue(true),
            markSandbox: vi.fn().mockResolvedValue(true),
        };
        const tasks = { enqueue: vi.fn() };
        const provider = { send: vi.fn().mockResolvedValue({ kind: "accepted", providerMessageId: "re_123" }) };
        const service = new EmailService(repository as never, tasks as never, provider as never, { mode: "resend", fromAddress: "shop@example.test" });
        await expect(service.processEmail(lease(new Date("2026-10-14T11:00:00Z")))).resolves.toEqual({ kind: "success", providerReference: "re_123" });
        expect(provider.send).toHaveBeenCalledWith(message, "order-placed:42");
        expect(repository.markAccepted).toHaveBeenCalledWith(9, "re_123", lease(new Date("2026-10-14T11:00:00Z")));
    });

    it("reuses the same idempotency payload after provider acceptance and lease takeover", async () => {
        const message = renderEmail(event);
        const repository = {
            findForSend: vi.fn().mockResolvedValue({ id: 9, message, state: "PENDING" }),
            markAccepted: vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true),
        };
        const tasks = { enqueue: vi.fn() };
        const provider = { send: vi.fn().mockResolvedValue({ kind: "accepted", providerMessageId: "re_123" }) };
        const service = new EmailService(repository as never, tasks as never, provider as never, { mode: "resend" });
        const firstLease = lease(new Date());
        const secondLease = { ...firstLease, token: "new-fencing-token", attempt: 2 };
        await expect(service.processEmail(firstLease)).resolves.toEqual({ kind: "ambiguous", reason: "email_lease_lost_after_provider_response" });
        await expect(service.processEmail(secondLease)).resolves.toEqual({ kind: "success", providerReference: "re_123" });
        expect(provider.send.mock.calls).toEqual([[message, event.eventKey], [message, event.eventKey]]);
    });

    it("moves an ambiguous near-expiry retry to review without calling the provider", async () => {
        const now = new Date();
        const provider = { send: vi.fn() };
        const service = new EmailService({ findForSend: vi.fn().mockResolvedValue({ id: 9, message: renderEmail(event), state: "PENDING" }), markReviewRequired: vi.fn().mockResolvedValue(true) } as never, {} as never, provider as never,
            { mode: "resend", fromAddress: "shop@example.test" });
        await expect(service.processEmail(lease(new Date(now.getTime() - 23 * 60 * 60 * 1000), 2)))
            .resolves.toEqual({ kind: "ambiguous", reason: "idempotency_window_near_expiry" });
        expect(provider.send).not.toHaveBeenCalled();
    });

    it("marks sandbox acceptance explicitly and rejects sandbox in production", async () => {
        const provider = { send: vi.fn().mockResolvedValue({ kind: "sandbox", fixtureId: "accepted-local" }) };
        const repository = {
            findForSend: vi.fn().mockResolvedValue({ id: 9, message: renderEmail(event), state: "PENDING" }),
            markSandbox: vi.fn().mockResolvedValue(true),
        };
        const service = new EmailService(repository as never, {} as never, provider as never, { mode: "sandbox", fromAddress: "shop@example.test" });
        await expect(service.processEmail(lease(new Date()))).resolves.toEqual({ kind: "success", providerReference: "sandbox:accepted-local" });
        expect(repository.markSandbox).toHaveBeenCalled();
        expect(() => createEmailProvider({ mode: "sandbox", production: true, fromAddress: "shop@example.test" })).toThrow(/production/i);
    });

    it("keeps disabled mode constructible but rejects send as a permanent configuration failure", async () => {
        const disabled = createEmailProvider({ mode: "disabled", production: false });
        await expect(disabled.send(renderEmail(event), event.eventKey)).rejects.toMatchObject({ statusCode: 400 });
        expect(() => createEmailProvider({ mode: "resend", production: false, fromAddress: "shop@example.test" })).toThrow(/API key/i);
    });

    it("records disabled delivery as a permanent provider failure", async () => {
        const repository = { findForSend: vi.fn().mockResolvedValue({ id: 9, message: renderEmail(event), state: "PENDING" }), markFailed: vi.fn().mockResolvedValue(true) };
        const service = new EmailService(repository as never, {} as never, createEmailProvider({ mode: "disabled" }), { mode: "disabled" });
        await expect(service.processEmail(lease(new Date()))).resolves.toEqual({ kind: "permanent", reason: "provider_rejected_request" });
        expect(repository.markFailed).toHaveBeenCalledWith(9, "provider_rejected_request", expect.any(Object));
    });

    it("requires explicit unknown-outcome acknowledgement and audits an immutable resend", async () => {
        const tx = { query: vi.fn() };
        const original = { id: 9, event, state: "ACCEPTED" };
        const repository = {
            withTransaction: vi.fn((work: (value: unknown) => unknown) => work(tx)),
            getForResend: vi.fn().mockResolvedValue(original),
            enqueue: vi.fn().mockResolvedValue({ id: 12, created: true }),
        };
        const tasks = { enqueue: vi.fn().mockResolvedValue(33) };
        const service = new EmailService(repository as never, tasks as never, {} as never, { mode: "disabled" });
        await expect(service.resend(9, "admin-user", false)).rejects.toThrow(/acknowledge/i);
        expect(repository.enqueue).not.toHaveBeenCalled();
        await expect(service.resend(9, "admin-user", true)).resolves.toEqual({ emailId: 12, taskId: 33 });
        expect(repository.enqueue).toHaveBeenCalledWith(tx, expect.objectContaining({
            type: event.type, recipient: event.recipient, snapshot: event.snapshot,
        }), expect.objectContaining({ to: [event.recipient] }), {
            resendOfId: 9, createdByAdminId: "admin-user", unknownOutcomeAcknowledged: true,
        });
        expect(tasks.enqueue).toHaveBeenCalledWith(tx, { kind: "EMAIL_SEND", key: expect.stringMatching(/^admin-resend:9:/), payload: { emailId: 12 } });
    });

    it("treats persisted acceptance as distinct from delivery", async () => {
        const repository = { findForSend: vi.fn().mockResolvedValue({ id: 9, message: {} as EmailMessage, state: "ACCEPTED" }) };
        const provider = { send: vi.fn() };
        const service = new EmailService(repository as never, {} as never, provider as never, { mode: "resend", fromAddress: "shop@example.test" });
        await expect(service.processEmail(lease(new Date()))).resolves.toEqual({ kind: "success", providerReference: "accepted" });
        expect(provider.send).not.toHaveBeenCalled();
    });

    it("persists a permanent provider error and returns a bounded retry for a rate limit", async () => {
        const persisted = { id: 9, message: renderEmail(event), state: "PENDING" };
        const repository = { findForSend: vi.fn().mockResolvedValue(persisted), markFailed: vi.fn().mockResolvedValue(true) };
        const permanentProvider = { send: vi.fn().mockRejectedValue(Object.assign(new Error("no"), { statusCode: 422 })) };
        const permanent = new EmailService(repository as never, {} as never, permanentProvider as never, { mode: "resend" });
        await expect(permanent.processEmail(lease(new Date()))).resolves.toEqual({ kind: "permanent", reason: "provider_rejected_request" });
        expect(repository.markFailed).toHaveBeenCalledWith(9, "provider_rejected_request", expect.any(Object));

        const limitedProvider = { send: vi.fn().mockRejectedValue(Object.assign(new Error("slow"), { statusCode: 429, retryAfterMs: 45000 })) };
        const limited = new EmailService(repository as never, {} as never, limitedProvider as never, { mode: "resend" });
        await expect(limited.processEmail(lease(new Date()))).resolves.toEqual({ kind: "retryable", reason: "provider_rate_limited", retryAfterMs: 45000 });
    });
});
