import { DynamicModule, Module } from "@nestjs/common";
import { TasksModule } from "../operations/tasks.module";
import { EmailService } from "./email.service";
import { TransactionalEmailRepository } from "./email.repository";
import { ResendEmailProvider } from "./resend.provider";
import { SandboxEmailProvider } from "./sandbox-email.provider";
import { DisabledEmailProvider } from "./disabled-email.provider";
import { EMAIL_CONFIG, EMAIL_PROVIDER, type EmailConfig } from "./email.types";
import type { EmailProvider } from "./email-provider";
import { EmailWebhookController } from "./email-webhook.controller";
import { EmailWebhookService, RESEND_WEBHOOK_VERIFIER } from "./email-webhook.service";
import { AdminEmailController } from "./admin-email.controller";
import { verifyResendWebhook } from "./resend.provider";

export function createEmailProvider(config: EmailConfig): EmailProvider {
    if (config.mode === "disabled") return new DisabledEmailProvider();
    if (config.mode === "sandbox") {
        if (config.production) throw new Error("Sandbox email provider is forbidden in production");
        return new SandboxEmailProvider(config.sandboxFixture || "accepted");
    }
    if (!config.apiKey) throw new Error("Resend API key is required");
    if (!config.fromAddress) throw new Error("Resend sender address is required");
    return new ResendEmailProvider(config);
}

@Module({})
export class EmailModule {
    static register(config: EmailConfig): DynamicModule {
        return {
            module: EmailModule,
            global: true,
            imports: [TasksModule],
            controllers: [EmailWebhookController, AdminEmailController],
            providers: [
                { provide: EMAIL_CONFIG, useValue: config },
                { provide: EMAIL_PROVIDER, useFactory: () => createEmailProvider(config) },
                TransactionalEmailRepository,
                EmailService,
                { provide: RESEND_WEBHOOK_VERIFIER, useValue: (raw: string, headers: Parameters<typeof verifyResendWebhook>[3], value: EmailConfig) => verifyResendWebhook(value.apiKey!, value.webhookSecret!, raw, headers) },
                EmailWebhookService,
            ],
            exports: [EmailService, EMAIL_CONFIG],
        };
    }
}
