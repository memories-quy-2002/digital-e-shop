import crypto from "node:crypto";
import { BadRequestException, Injectable } from "@nestjs/common";
import { logger } from "#src/shared/utils/logger";
import { ResendEmailService } from "../email/resend-email.service";
import { isEmailVerified, toPublicUser } from "../users/user-public";
import { UsersRepository } from "../users/users.repository";
import type { UserRow } from "../users/users.types";

export const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
export const EMAIL_VERIFICATION_RESEND_COOLDOWN_MS = 60 * 1000;

export type EmailVerificationResult = {
    sent: boolean;
    emailVerified: boolean;
};

const normalizeEmail = (email: string) => email.trim().toLowerCase();
const hashToken = (token: string) => crypto.createHash("sha256").update(token).digest("hex");
@Injectable()
export class EmailVerificationService {
    constructor(
        private readonly usersRepository: UsersRepository,
        private readonly resendEmailService: ResendEmailService,
    ) {}

    async createAndSend(user: UserRow): Promise<EmailVerificationResult> {
        if (isEmailVerified(user)) return { sent: false, emailVerified: true };

        const email = typeof user.email === "string" ? normalizeEmail(user.email) : "";
        if (!email) return { sent: false, emailVerified: false };

        const token = crypto.randomBytes(32).toString("base64url");
        const tokenHash = hashToken(token);
        const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS);
        const stored = await this.usersRepository.setEmailVerificationToken(user.id, tokenHash, expiresAt);
        if (!stored?.affectedRows) return { sent: false, emailVerified: false };

        try {
            const sent = await this.resendEmailService.sendEmailVerification({
                userId: user.id,
                email,
                name: user.username,
                token,
                tokenHash,
            });
            return { sent, emailVerified: false };
        } catch (error) {
            // Delivery failures must not roll back account creation. The stored
            // token can be replaced by a later, rate-limited resend request.
            logger.warn({ userId: user.id, error }, "[EmailVerificationService] unable to send verification email");
            return { sent: false, emailVerified: false };
        }
    }

    async resendByEmail(email: string): Promise<{ sent: boolean }> {
        const user = await this.usersRepository.findByEmail(normalizeEmail(email));
        if (!user || isEmailVerified(user)) return { sent: false };

        const lastSent = user.email_verification_sent_at
            ? new Date(user.email_verification_sent_at).getTime()
            : 0;
        if (lastSent > 0 && Date.now() - lastSent < EMAIL_VERIFICATION_RESEND_COOLDOWN_MS) {
            return { sent: false };
        }

        const result = await this.createAndSend(user);
        return { sent: result.sent };
    }

    async confirm(rawToken: string): Promise<{ user: UserRow; emailVerified: true }> {
        const token = rawToken.trim();
        const tokenHash = hashToken(token);
        const candidate = await this.usersRepository.findByVerificationTokenHash(tokenHash);
        if (!candidate) {
            throw new BadRequestException({
                msg: "This verification link is invalid or expired.",
                code: "EMAIL_VERIFICATION_INVALID",
            });
        }

        const consumed = await this.usersRepository.consumeEmailVerificationToken(candidate.id, tokenHash);
        if (!consumed?.affectedRows) {
            throw new BadRequestException({
                msg: "This verification link is invalid or expired.",
                code: "EMAIL_VERIFICATION_INVALID",
            });
        }

        const user = await this.usersRepository.findById(candidate.id);
        if (!user) {
            throw new BadRequestException({
                msg: "The account for this verification link no longer exists.",
                code: "EMAIL_VERIFICATION_INVALID",
            });
        }

        return { user: toPublicUser(user), emailVerified: true };
    }
}
