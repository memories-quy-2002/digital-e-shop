import { BadRequestException, Inject, Injectable, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { createHash } from "node:crypto";
import { TransactionalEmailRepository } from "./email.repository";
import { EMAIL_CONFIG, type DeliveryEventResult, type EmailConfig, type EmailRepository } from "./email.types";
import { verifyResendWebhook, type ResendWebhookHeaders } from "./resend.provider";

export const RESEND_WEBHOOK_VERIFIER = Symbol("RESEND_WEBHOOK_VERIFIER");
export type ResendWebhookVerifier = (rawBody: string, headers: ResendWebhookHeaders, config: EmailConfig) => unknown;

@Injectable()
export class EmailWebhookService {
    constructor(
        @Inject(TransactionalEmailRepository) private readonly repository: Pick<EmailRepository, "recordDeliveryEvent">,
        @Inject(EMAIL_CONFIG) private readonly config: EmailConfig,
        @Inject(RESEND_WEBHOOK_VERIFIER) private readonly verifier: ResendWebhookVerifier = defaultVerifier,
    ) {}

    async accept(rawBody: string, headers: ResendWebhookHeaders): Promise<DeliveryEventResult | { kind: "ignored" }> {
        if (typeof rawBody !== "string" || rawBody.length === 0 || Buffer.byteLength(rawBody, "utf8") > 64 * 1024) {
            throw new BadRequestException("Invalid webhook body");
        }
        if (!headers?.id || !headers.timestamp || !headers.signature) throw new BadRequestException("Missing webhook signature headers");
        if (headers.id.length > 191 || headers.timestamp.length > 80 || headers.signature.length > 1024) {
            throw new BadRequestException("Invalid webhook signature headers");
        }
        if (this.config.mode !== "resend" || !this.config.apiKey || !this.config.webhookSecret) {
            throw new UnauthorizedException("Webhook verification is unavailable");
        }
        let event: unknown;
        try {
            event = this.verifier(rawBody, headers, this.config);
        } catch {
            throw new UnauthorizedException("Invalid webhook signature");
        }
        if (!isWebhookEvent(event)) return { kind: "ignored" };
        if (event.type !== "email.delivered" && event.type !== "email.bounced" && event.type !== "email.failed") return { kind: "ignored" };
        const providerMessageId = event.data.email_id;
        if (!providerMessageId) return { kind: "ignored" };
        const payloadHash = createHash("sha256").update(rawBody, "utf8").digest("hex");
        const result = await this.repository.recordDeliveryEvent({
            providerEventId: headers.id,
            providerMessageId,
            eventType: event.type,
            payloadHash,
        });
        if (result.kind === "ignored") {
            throw new ServiceUnavailableException("Verified delivery event is not mapped yet; retry later.");
        }
        return result;
    }
}

function defaultVerifier(rawBody: string, headers: ResendWebhookHeaders, config: EmailConfig): unknown {
    return verifyResendWebhook(config.apiKey!, config.webhookSecret!, rawBody, headers);
}

function isWebhookEvent(value: unknown): value is { type: string; data: { email_id?: string } } {
    if (!value || typeof value !== "object") return false;
    const event = value as { type?: unknown; data?: unknown };
    return typeof event.type === "string" && Boolean(event.data) && typeof event.data === "object"
        && (!((event.data as { email_id?: unknown }).email_id) || typeof (event.data as { email_id?: unknown }).email_id === "string");
}
