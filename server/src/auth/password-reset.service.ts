import crypto from "node:crypto";
import { BadRequestException, Injectable } from "@nestjs/common";
import { env } from "#src/config/env.config";
import { logger } from "#src/shared/utils/logger";
import { hashPassword } from "#src/utils/hashPassword";
import { AuthRepository } from "./auth.repository";
import { FirebaseAdminAuthService } from "./firebase-admin.service";
import { UsersRepository } from "../users/users.repository";
import type { UserRow } from "../users/users.types";
import { isEmailVerified } from "../users/user-public";
import { ResendEmailService } from "../email/resend-email.service";

export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

const normalizeEmail = (email: string) => email.trim().toLowerCase();
const hashToken = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

@Injectable()
export class PasswordResetService {
    constructor(
        private readonly usersRepository: UsersRepository,
        private readonly authRepository: AuthRepository,
        private readonly resendEmailService: ResendEmailService,
        private readonly firebaseAdminAuthService: FirebaseAdminAuthService,
    ) {}

    async request(email: string): Promise<void> {
        const normalizedEmail = normalizeEmail(email);
        const user = await this.usersRepository.findByEmail(normalizedEmail);
        if (!user || user.status === "Suspended") return;
        if (!isEmailVerified(user)) return;

        try {
            const isFirebase = env.authProvider === "firebase" || user.auth_provider === "firebase";
            let resetUrl: string;
            let tokenHash: string;

            if (isFirebase) {
                resetUrl = await this.firebaseAdminAuthService.generatePasswordResetLink(normalizedEmail);
                tokenHash = hashToken(resetUrl);
            } else {
                const rawToken = crypto.randomBytes(32).toString("base64url");
                tokenHash = hashToken(rawToken);
                await this.usersRepository.setPasswordResetToken(
                    user.id,
                    tokenHash,
                    new Date(Date.now() + PASSWORD_RESET_TTL_MS),
                );
                resetUrl = `${env.clientUrl || "http://localhost:5173"}/reset-password?token=${encodeURIComponent(rawToken)}`;
            }

            await this.resendEmailService.sendPasswordReset({
                userId: user.id,
                email: normalizedEmail,
                name: user.username,
                resetUrl,
                tokenHash,
                emailVerified: true,
            });
        } catch (error) {
            logger.warn({ userId: user.id, error }, "[PasswordResetService] unable to prepare password reset email");
        }
    }

    async confirm(token: string, newPassword: string): Promise<UserRow> {
        const tokenHash = hashToken(token);
        const user = await this.usersRepository.findByPasswordResetTokenHash(tokenHash);
        if (!user || user.auth_provider === "firebase") {
            throw new BadRequestException({ msg: "This password reset link is invalid or expired." });
        }

        const passwordHash = await hashPassword(newPassword);
        const result = await this.usersRepository.consumePasswordResetToken(user.id, tokenHash, passwordHash);
        if (!result.affectedRows) {
            throw new BadRequestException({ msg: "This password reset link is invalid or expired." });
        }

        await this.authRepository.revokeAllSessions(user.id);
        const updatedUser = (await this.usersRepository.findById(user.id)) || user;
        try {
            await this.resendEmailService.sendPasswordChangedNotice({
                userId: user.id,
                email: updatedUser.email || user.email || "",
                name: updatedUser.username || user.username,
                emailVerified: isEmailVerified(updatedUser),
            });
        } catch (error) {
            logger.warn({ userId: user.id, error }, "[PasswordResetService] unable to send password changed notice");
        }

        return updatedUser;
    }
}
