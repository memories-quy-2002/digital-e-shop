import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { Injectable, UnauthorizedException } from "@nestjs/common";
import { env } from "#src/config/env.config";
import { UsersRepository } from "../users/users.repository";
import type { UserRow } from "../users/users.types";
import { toPublicUser } from "../users/user-public";
import { AuthRepository } from "./auth.repository";
import type { AuthSessionPayload } from "./auth.types";

export const ACCESS_TTL = "15m" as const;
export const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
export const REMEMBER_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type RotatedAuthSession = {
    accessToken: string;
    refreshToken: string;
    rememberMe: boolean;
};

export const hashRefreshToken = (token: string) =>
    crypto.createHash("sha256").update(token).digest("hex");

const newRefreshToken = () => crypto.randomBytes(48).toString("base64url");

const refreshExpiry = (rememberMe: boolean) =>
    new Date(Date.now() + (rememberMe ? REMEMBER_TTL_MS : SESSION_TTL_MS));

const sessionDate = (value: string | Date | null | undefined) =>
    value instanceof Date ? value : new Date(value || 0);

const sameHash = (left: string | null | undefined, right: string) => {
    if (!left) return false;
    const leftBuffer = Buffer.from(left, "hex");
    const rightBuffer = Buffer.from(right, "hex");
    return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

@Injectable()
export class AuthSessionService {
    constructor(
        private readonly authRepository: AuthRepository,
        private readonly usersRepository: UsersRepository,
    ) {}

    private signAccessToken(user: UserRow, sessionId: number) {
        return jwt.sign(
            { id: user.id, email: user.email, role: user.role, sid: sessionId },
            env.jwtSecret,
            { expiresIn: ACCESS_TTL },
        );
    }

    private async persistAccessToken(user: UserRow, accessToken: string) {
        if (typeof this.usersRepository.updateUserToken === "function") {
            await this.usersRepository.updateUserToken(user.id, accessToken);
        }
    }

    async issue(user: UserRow, rememberMe = false): Promise<AuthSessionPayload> {
        const rawRefreshToken = newRefreshToken();
        const sessionId = await this.authRepository.startSession(
            user.id,
            hashRefreshToken(rawRefreshToken),
            refreshExpiry(rememberMe),
        );
        const accessToken = this.signAccessToken(user, sessionId);
        await this.persistAccessToken(user, accessToken);

        return {
            user: toPublicUser(user),
            token: accessToken,
            sessionId,
            refreshToken: rawRefreshToken,
            rememberMe,
        };
    }

    async rotate(sessionId: number | string, rawRefreshToken: string): Promise<RotatedAuthSession> {
        const numericSessionId = Number.parseInt(String(sessionId), 10);
        if (!Number.isInteger(numericSessionId) || numericSessionId <= 0 || !rawRefreshToken) {
            throw new UnauthorizedException({ msg: "Invalid refresh token" });
        }

        const session = await this.authRepository.getActiveSessionById(numericSessionId);
        const suppliedHash = hashRefreshToken(rawRefreshToken);
        if (!session || !sameHash(session.refresh_token_hash, suppliedHash)) {
            throw new UnauthorizedException({ msg: "Invalid refresh token" });
        }

        const user = await this.usersRepository.findById(String(session.user_id));
        if (!user) {
            throw new UnauthorizedException({ msg: "Account is not registered" });
        }
        if (user.status && user.status !== "Active") {
            throw new UnauthorizedException({ msg: "Account is suspended" });
        }

        const nextRefreshToken = newRefreshToken();
        const currentExpiry = sessionDate(session.refresh_expires_at);
        const rememberMe = currentExpiry.getTime() - Date.now() > SESSION_TTL_MS * 2;
        const rotated = await this.authRepository.rotateRefreshToken(
            numericSessionId,
            suppliedHash,
            hashRefreshToken(nextRefreshToken),
            currentExpiry,
        );
        if (!rotated) {
            await this.authRepository.revokeSession(numericSessionId);
            throw new UnauthorizedException({ msg: "Invalid refresh token" });
        }

        const accessToken = this.signAccessToken(user, numericSessionId);
        await this.persistAccessToken(user, accessToken);
        return { accessToken, refreshToken: nextRefreshToken, rememberMe };
    }
}
