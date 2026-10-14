import type { EmailMessage, EmailSendResult } from "./email.types";

export interface EmailProvider {
    send(message: EmailMessage, idempotencyKey: string): Promise<EmailSendResult>;
}
