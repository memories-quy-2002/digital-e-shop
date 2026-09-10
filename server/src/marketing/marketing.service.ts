import crypto from "node:crypto";
import { BadRequestException, Injectable, Optional } from "@nestjs/common";
import { z } from "zod";
import { env } from "#src/config/env.config";
import { logger } from "#src/shared/utils/logger";
import { ResendEmailService } from "../email/resend-email.service";
import { isEmailVerified } from "../users/user-public";
import { UsersRepository } from "../users/users.repository";
import { MarketingRepository } from "./marketing.repository";

const marketingEmailSchema = z.string().trim().max(255).email();
const normalizeEmail = (email: string) => {
    const result = marketingEmailSchema.safeParse(email);
    if (!result.success) throw new BadRequestException({ msg: "Email must be valid" });
    return result.data.toLowerCase();
};
const hashToken = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

@Injectable()
export class MarketingService {
    constructor(
        private readonly subscriptionsRepository: MarketingRepository,
        private readonly resendEmailService: ResendEmailService,
        @Optional() private readonly usersRepository?: UsersRepository,
    ) {}

    async subscribe(inputEmail: string, source = "footer"): Promise<{ subscribed: true; alreadySubscribed: boolean }> {
        const email = normalizeEmail(inputEmail);
        const current = await this.subscriptionsRepository.findByEmail(email);
        if (current?.status === "ACTIVE") {
            return { subscribed: true, alreadySubscribed: true };
        }

        const rawToken = crypto.randomBytes(32).toString("base64url");
        const tokenHash = hashToken(rawToken);
        const subscription = await this.subscriptionsRepository.upsertSubscription(email, tokenHash, source.trim() || "footer");
        if (!subscription) {
            throw new BadRequestException({ msg: "Unable to subscribe right now" });
        }

        const account = this.usersRepository
            ? await this.usersRepository.findByEmail(email)
            : null;
        try {
            await this.resendEmailService.sendMarketingWelcome({
                subscriptionId: Number(subscription.id),
                email,
                unsubscribeUrl: `${env.clientUrl || "http://localhost:5173"}/unsubscribe?token=${encodeURIComponent(rawToken)}`,
                tokenHash,
                // A valid address without a Digital-E account is an external
                // marketing opt-in. Account addresses must be verified first.
                emailVerified: !account || isEmailVerified(account),
            });
        } catch (error) {
            logger.warn({ subscriptionId: subscription.id, error }, "[MarketingService] unable to send welcome email");
        }

        return { subscribed: true, alreadySubscribed: false };
    }

    async unsubscribe(token: string): Promise<{ unsubscribed: true }> {
        const tokenHash = hashToken(token);
        const subscription = await this.subscriptionsRepository.findByUnsubscribeTokenHash(tokenHash);
        if (!subscription) throw new BadRequestException({ msg: "This unsubscribe link is invalid or expired." });

        const result = await this.subscriptionsRepository.unsubscribeByTokenHash(tokenHash);
        if (!result.affectedRows) throw new BadRequestException({ msg: "This unsubscribe link is invalid or expired." });
        return { unsubscribed: true };
    }
}
