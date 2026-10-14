import { Resend, type WebhookEventPayload } from "resend";
import { providerError } from "./email.policy";
import type { EmailConfig, EmailMessage, EmailSendResult } from "./email.types";
import type { EmailProvider } from "./email-provider";

function retryAfterMs(value: string | undefined): number | undefined {
    if (!value) return undefined;
    const seconds = Number(value);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
    const date = Date.parse(value);
    return Number.isFinite(date) ? Math.max(0, date - Date.now()) : undefined;
}

export class ResendEmailProvider implements EmailProvider {
    private readonly resend: Resend;

    constructor(private readonly config: EmailConfig) {
        if (!config.apiKey || !config.fromAddress) throw new Error("Resend requires an API key and sender address");
        this.resend = new Resend(config.apiKey);
    }

    async send(message: EmailMessage, idempotencyKey: string): Promise<EmailSendResult> {
        const { data, error, headers } = await this.resend.emails.send({
            from: this.config.fromAddress!, to: message.to, subject: message.subject, text: message.text, html: message.html,
        }, { idempotencyKey, signal: AbortSignal.timeout(8_000) });
        if (error) throw providerError(error.statusCode, retryAfterMs(headers?.["retry-after"]));
        if (!data?.id) throw providerError(null);
        return { kind: "accepted", providerMessageId: data.id };
    }
}

export type ResendWebhookHeaders = { id: string; timestamp: string; signature: string };

/** Verify the exact raw body; callers must pass webhook-id, webhook-timestamp and webhook-signature. */
export function verifyResendWebhook(
    apiKey: string,
    webhookSecret: string,
    payload: string,
    headers: ResendWebhookHeaders,
): WebhookEventPayload {
    if (!apiKey || !webhookSecret || typeof payload !== "string") throw new Error("Resend webhook verification is not configured");
    return new Resend(apiKey).webhooks.verify({ payload, headers, webhookSecret });
}
