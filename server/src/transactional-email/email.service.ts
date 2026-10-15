import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { TaskLease, TaskResult } from "../operations/tasks.types";
import { emailRetryPolicy } from "./email.policy";
import { renderEmail, sanitizeEmailEvent } from "./email.templates";
import { EMAIL_CONFIG, EMAIL_PROVIDER, type EmailBusinessEvent, type EmailConfig, type EmailRepository, type EmailTaskService, type ResendAudit } from "./email.types";
import type { EmailProvider } from "./email-provider";
import { TransactionalEmailRepository } from "./email.repository";
import { TasksService } from "../operations/tasks.service";

@Injectable()
export class EmailService {
    constructor(
        @Inject(TransactionalEmailRepository) private readonly repository: EmailRepository,
        @Inject(TasksService) private readonly tasks: EmailTaskService,
        @Inject(EMAIL_PROVIDER) private readonly provider?: EmailProvider,
        @Inject(EMAIL_CONFIG) private readonly config: EmailConfig = { mode: "disabled" },
    ) {}

    async enqueue(tx: Parameters<EmailRepository["enqueue"]>[0], event: EmailBusinessEvent): Promise<number | null> {
        if (!this.provider) throw new Error("Transactional email provider is unavailable");
        const safeEvent = sanitizeEmailEvent(event);
        const message = renderEmail(safeEvent);
        const persisted = await this.repository.enqueue(tx, safeEvent, message);
        const taskId = await this.tasks.enqueue(tx, { kind: "EMAIL_SEND", key: safeEvent.eventKey, payload: { emailId: persisted.id } });
        return taskId || null;
    }

    async resend(emailId: number, adminId: string, acknowledgeUnknownOutcome: boolean): Promise<ResendAudit> {
        if (!Number.isSafeInteger(emailId) || emailId < 1 || !adminId) throw new BadRequestException("Invalid resend request");
        return this.repository.withTransaction(async (tx) => {
            const original = await this.repository.getForResend(tx, emailId);
            if (!original) throw new NotFoundException("Email message not found");
            const unknownOutcome = original.state === "ACCEPTED" || original.state === "REVIEW_REQUIRED";
            if (unknownOutcome && !acknowledgeUnknownOutcome) {
                throw new BadRequestException("Acknowledge the unknown delivery outcome before resending");
            }
            if (!unknownOutcome && original.state !== "FAILED") {
                throw new BadRequestException("Only failed or unknown-outcome emails can be resent");
            }
            const event = { ...original.event, eventKey: `admin-resend:${emailId}:${randomUUID()}` } as EmailBusinessEvent;
            const message = renderEmail(event);
            const persisted = await this.repository.enqueue(tx, event, message, {
                resendOfId: emailId,
                createdByAdminId: adminId,
                unknownOutcomeAcknowledged: unknownOutcome && acknowledgeUnknownOutcome,
            });
            const taskId = await this.tasks.enqueue(tx, { kind: "EMAIL_SEND", key: event.eventKey, payload: { emailId: persisted.id } });
            return { emailId: persisted.id, taskId };
        });
    }

    listAdminMessages(limit: number, afterId?: number) {
        return this.repository.listAdminMessages(limit, afterId);
    }

    async processEmail(lease: TaskLease): Promise<TaskResult> {
        if (lease.kind !== "EMAIL_SEND" || !lease.payload || typeof lease.payload !== "object"
            || !Number.isSafeInteger((lease.payload as { emailId?: unknown }).emailId)
            || Number((lease.payload as { emailId: number }).emailId) < 1) {
            return { kind: "permanent", reason: "invalid_email_task" };
        }
        const emailId = Number((lease.payload as { emailId: number }).emailId);
        const persisted = await this.repository.findForSend(emailId);
        if (!persisted) return { kind: "permanent", reason: "email_message_missing" };
        if (persisted.state === "ACCEPTED") return { kind: "success", providerReference: persisted.providerMessageId || "accepted" };
        if (persisted.state === "SANDBOX") return { kind: "success", providerReference: persisted.providerMessageId || "sandbox" };
        if (persisted.state === "FAILED") return { kind: "permanent", reason: "email_permanently_failed" };
        if (persisted.state === "REVIEW_REQUIRED") return { kind: "ambiguous", reason: "email_requires_review" };
        if (!this.provider) return { kind: "permanent", reason: "email_provider_unavailable" };

        const initialPolicy = emailRetryPolicy({ attempt: lease.attempt, firstAttemptAt: lease.firstAttemptAt, now: new Date() });
        if (initialPolicy.kind !== "send") {
            if (initialPolicy.kind === "ambiguous") await this.repository.markReviewRequired(emailId, initialPolicy.reason, lease);
            return initialPolicy;
        }

        try {
            const result = await this.provider.send(persisted.message, lease.key);
            const updated = result.kind === "accepted"
                ? await this.repository.markAccepted(emailId, result.providerMessageId, lease)
                : await this.repository.markSandbox(emailId, result.fixtureId, lease);
            if (!updated) return { kind: "ambiguous", reason: "email_lease_lost_after_provider_response" };
            return { kind: "success", providerReference: result.kind === "accepted" ? result.providerMessageId : `sandbox:${result.fixtureId}` };
        } catch (error) {
            const candidate = error as { statusCode?: number | null; retryAfterMs?: number };
            const decision = emailRetryPolicy({
                attempt: lease.attempt,
                firstAttemptAt: lease.firstAttemptAt,
                now: new Date(),
                providerError: { statusCode: typeof candidate.statusCode === "number" ? candidate.statusCode : null, retryAfterMs: candidate.retryAfterMs },
            });
            if (decision.kind === "permanent") {
                await this.repository.markFailed(emailId, decision.reason, lease);
                return decision;
            }
            if (decision.kind === "ambiguous") await this.repository.markReviewRequired(emailId, decision.reason, lease);
            if (decision.kind === "retryable" || decision.kind === "ambiguous") return decision;
            return { kind: "retryable", reason: "provider_network_unavailable" };
        }
    }
}
