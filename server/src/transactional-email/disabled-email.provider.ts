import { providerError } from "./email.policy";
import type { EmailProvider } from "./email-provider";
import type { EmailMessage, EmailSendResult } from "./email.types";

export class DisabledEmailProvider implements EmailProvider {
    async send(_message: EmailMessage, _idempotencyKey: string): Promise<EmailSendResult> {
        void _message;
        void _idempotencyKey;
        throw providerError(400);
    }
}
