import type { TransactionContext } from "../database/transaction";
import type { TaskLease, TaskResult } from "../operations/tasks.types";

export type EmailLocale = "en" | "vi";
export type EmailEventType = "account_welcome" | "order_placed" | "payment_confirmed" | "shipment_update" | "order_cancelled" | "after_sales_decision" | "refund_confirmation";
export type EmailItemSnapshot = { name: string; quantity: number };
type EmailEventBase = { eventKey: string; recipient: string; locale: EmailLocale };
export type EmailBusinessEvent =
    | (EmailEventBase & { type: "account_welcome"; snapshot: { customerName: string } })
    | (EmailEventBase & { type: "order_placed"; snapshot: { orderNumber: string; customerName: string; items: EmailItemSnapshot[]; itemsSubtotal: number; merchandiseDiscount: number; shippingFee: number; payableTotal: number; currency: "VND" } })
    | (EmailEventBase & { type: "payment_confirmed"; snapshot: { orderNumber: string; customerName: string; amount: number; currency: "VND" } })
    | (EmailEventBase & { type: "shipment_update"; snapshot: { orderNumber: string; customerName: string; status: string; trackingCode?: string; expectedDelivery?: string } })
    | (EmailEventBase & { type: "order_cancelled"; snapshot: { orderNumber: string; customerName: string; reason: string } })
    | (EmailEventBase & { type: "after_sales_decision"; snapshot: { orderNumber: string; customerName: string; decision: "approved" | "rejected"; publicMessage: string } })
    | (EmailEventBase & { type: "refund_confirmation"; snapshot: { orderNumber: string; customerName: string; refundAmount: number; currency: "VND" } });
export type EmailSnapshot = EmailBusinessEvent["snapshot"];

export type EmailMessage = {
    eventKey: string;
    locale: EmailLocale;
    to: [string];
    subject: string;
    text: string;
    html: string;
};

export type EmailSendResult =
    | { kind: "accepted"; providerMessageId: string }
    | { kind: "sandbox"; fixtureId: string };

export type { EmailProvider } from "./email-provider";
export type EmailProviderError = Error & { statusCode: number | null; retryAfterMs?: number };
export type EmailConfig = {
    mode: "disabled" | "sandbox" | "resend";
    production?: boolean;
    apiKey?: string;
    fromAddress?: string;
    webhookSecret?: string;
    sandboxFixture?: "accepted" | "rate_limited" | "permanent_failure" | "ambiguous";
};
export type PersistedEmail = { id: number; message: EmailMessage; state: string; providerMessageId?: string | null };
export type EmailRepository = {
    enqueue(tx: TransactionContext, event: EmailBusinessEvent, message: EmailMessage, audit?: { resendOfId: number; createdByAdminId: string; unknownOutcomeAcknowledged: boolean }): Promise<{ id: number; created: boolean }>;
    findForSend(id: number): Promise<PersistedEmail | null>;
    markAccepted(id: number, providerMessageId: string, lease: TaskLease): Promise<boolean>;
    markSandbox(id: number, fixtureId: string, lease: TaskLease): Promise<boolean>;
    markFailed(id: number, reason: string, lease: TaskLease): Promise<boolean>;
    markReviewRequired(id: number, reason: string, lease: TaskLease): Promise<boolean>;
    recordDeliveryEvent(input: DeliveryEventInput): Promise<DeliveryEventResult>;
    listAdminMessages(limit: number, afterId?: number): Promise<AdminEmailRow[]>;
    getForResend(tx: TransactionContext, id: number): Promise<ResendSource | null>;
    withTransaction<T>(work: (tx: TransactionContext) => Promise<T>): Promise<T>;
};

export type DeliveryEventInput = {
    providerEventId: string;
    providerMessageId: string;
    eventType: "email.delivered" | "email.bounced" | "email.failed";
    payloadHash: string;
};
export type DeliveryEventResult = { kind: "queued" | "duplicate"; eventId: number } | { kind: "ignored" };
export type AdminEmailRow = {
    id: number;
    eventType: string;
    recipientMasked: string;
    locale: EmailLocale;
    state: string;
    providerMessageId: string | null;
    createdAt: Date;
    updatedAt: Date;
    lastErrorCode: string | null;
};
export type ResendSource = {
    id: number;
    event: EmailBusinessEvent;
    state: string;
};
export type ResendAudit = { emailId: number; taskId: number };
export type EmailTaskService = {
    enqueue(tx: TransactionContext, input: { kind: "EMAIL_SEND"; key: string; payload: object }): Promise<number>;
};
export type EmailProcessResult = TaskResult;
export type EmailLease = TaskLease;

export const EMAIL_PROVIDER = Symbol("EMAIL_PROVIDER");
export const EMAIL_CONFIG = Symbol("EMAIL_CONFIG");
