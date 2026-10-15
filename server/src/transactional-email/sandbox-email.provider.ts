import { providerError } from "./email.policy";
import type { EmailSendResult } from "./email.types";
import type { EmailProvider } from "./email-provider";

export type SandboxEmailFixture = "accepted" | "rate_limited" | "permanent_failure" | "ambiguous";

export class SandboxEmailProvider implements EmailProvider {
    constructor(private readonly fixture: SandboxEmailFixture = "accepted") {}

    async send(): Promise<EmailSendResult> {
        switch (this.fixture) {
            case "accepted": return { kind: "sandbox", fixtureId: "accepted-local" };
            case "rate_limited": throw providerError(429, 30000);
            case "permanent_failure": throw providerError(422);
            case "ambiguous": throw providerError(null);
        }
    }
}
