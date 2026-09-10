import crypto from "node:crypto";
import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { env } from "#src/config/env.config";
import { logger } from "#src/shared/utils/logger";
import { FirebaseAdminAuthService } from "./firebase-admin.service";
import { UsersRepository } from "../users/users.repository";
import type { UserRow } from "../users/users.types";
import { isEmailVerified } from "../users/user-public";
import { ResendEmailService } from "../email/resend-email.service";

export const EMAIL_CHANGE_TTL_MS = 60 * 60 * 1000;

const normalizeEmail = (email: string) => email.trim().toLowerCase();
const hashToken = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

@Injectable()
export class EmailChangeService {
    constructor(
        private readonly usersRepository: UsersRepository,
        private readonly resendEmailService: ResendEmailService,
        private readonly firebaseAdminAuthService: FirebaseAdminAuthService,
    ) {}

    async request(userId: string, requestedEmail: string): Promise<{ email: string }> {
        const user = await this.usersRepository.findById(userId);
        if (!user) throw new NotFoundException({ msg: "User not found" });

        const email = normalizeEmail(requestedEmail);
        if (email === normalizeEmail(user.email || "")) {
            throw new BadRequestException({ msg: "This is already your current email." });
        }

        const existing = await this.usersRepository.findByEmail(email);
        if (existing && String(existing.id) !== String(user.id)) {
            throw new ConflictException({ msg: "An account already exists for this email", code: "EMAIL_IN_USE" });
        }

        const rawToken = crypto.randomBytes(32).toString("base64url");
        const tokenHash = hashToken(rawToken);
        await this.usersRepository.setPendingEmailChange(
            user.id,
            email,
            tokenHash,
            new Date(Date.now() + EMAIL_CHANGE_TTL_MS),
        );

        const confirmUrl = `${env.clientUrl || "http://localhost:5173"}/confirm-email-change?token=${encodeURIComponent(rawToken)}`;
        const deliveries = [
            this.resendEmailService.sendEmailChangeConfirmation({
                userId: user.id,
                email,
                name: user.username,
                confirmUrl,
                tokenHash,
            }),
            user.email
                ? this.resendEmailService.sendEmailChangeNotice({
                    userId: user.id,
                    email: user.email,
                    name: user.username,
                    newEmail: email,
                    event: "requested",
                    emailVerified: isEmailVerified(user),
                })
                : Promise.resolve(),
        ];

        const results = await Promise.allSettled(deliveries);
        for (const result of results) {
            if (result.status === "rejected") {
                logger.warn({ userId: user.id, error: result.reason }, "[EmailChangeService] email-change request delivery failed");
            }
        }

        return { email };
    }

    async confirm(token: string): Promise<UserRow> {
        const tokenHash = hashToken(token);
        const user = await this.usersRepository.findByEmailChangeTokenHash(tokenHash);
        const email = normalizeEmail(user?.pending_email || "");
        if (!user || !email) {
            throw new BadRequestException({ msg: "This email-change link is invalid or expired." });
        }

        if (user.auth_provider === "firebase" || env.authProvider === "firebase") {
            try {
                await this.firebaseAdminAuthService.updateEmail(user.id, email);
            } catch (error) {
                logger.warn({ userId: user.id, error }, "[EmailChangeService] unable to update Firebase email");
                throw new BadRequestException({ msg: "Unable to update this email address right now." });
            }
        }

        const result = await this.usersRepository.consumeEmailChangeToken(user.id, tokenHash, email);
        if (!result.affectedRows) {
            throw new BadRequestException({ msg: "This email-change link is invalid or expired." });
        }

        const updatedUser = (await this.usersRepository.findById(user.id)) || { ...user, email };
        const notifications = [
            user.email && user.email !== email
                ? this.resendEmailService.sendEmailChangeNotice({
                    userId: user.id,
                    email: user.email,
                    name: user.username,
                    newEmail: email,
                    event: "changed",
                    emailVerified: isEmailVerified(user),
                })
                : Promise.resolve(),
            this.resendEmailService.sendEmailChangeNotice({
                userId: user.id,
                email,
                name: user.username,
                newEmail: email,
                event: "changed",
                emailVerified: true,
            }),
        ];
        const results = await Promise.allSettled(notifications);
        for (const notification of results) {
            if (notification.status === "rejected") {
                logger.warn({ userId: user.id, error: notification.reason }, "[EmailChangeService] email-change notice delivery failed");
            }
        }

        return updatedUser;
    }
}
