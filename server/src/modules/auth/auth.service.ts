import crypto from "crypto";
import jwt from "jsonwebtoken";
import type { Request } from "express";
import { BaseService } from "#src/core/base/BaseService";
import { UnauthorizedError } from "#src/core/errors/UnauthorizedError";
import { env } from "#src/config/env.config";
import { hashPassword } from "#src/utils/hashPassword";
import { usersRepository } from "#src/modules/users/users.repository";
import type { RegisterUserInput } from "./auth.dto";
import type { AuthSessionPayload, JwtPayload, SocialAuthProfile } from "./auth.types";
import { authRepository } from "./auth.repository";

class AuthService extends BaseService {
    async startSession(userId: string) {
        return authRepository.startSession(userId);
    }

    async verifySessionToken(req: Request): Promise<{ valid: boolean; message?: string }> {
        const sessionId = req.cookies.session;
        const accessToken = req.cookies.accessToken;

        if (!sessionId || !accessToken) {
            return { valid: false, message: "Missing session or access token" };
        }

        try {
            jwt.verify(accessToken, env.jwtSecret);
            const session = await authRepository.getSessionById(sessionId);

            if (!session) {
                return { valid: false, message: "Session not found" };
            }

            return { valid: true };
        } catch {
            return { valid: false, message: "Session invalid or expired" };
        }
    }

    async endSession(sessionId: number | string) {
        const session = await authRepository.getSessionById(sessionId);
        if (!session || !session.session_start) {
            return null;
        }

        const sessionEnd = new Date();
        await authRepository.updateSession(sessionId, sessionEnd);
        return { sessionEnd };
    }

    private async issueLoginSession(user: Awaited<ReturnType<typeof usersRepository.findById>> extends infer T ? Exclude<T, null> : never, rememberMe?: boolean): Promise<AuthSessionPayload> {
        const payload = { id: user.id, email: user.email, role: user.role } as JwtPayload;
        const accessToken = jwt.sign(payload, env.jwtSecret, {
            expiresIn: rememberMe ? "30d" : "15m",
        });

        await usersRepository.updateUserToken(user.id, accessToken);

        let refreshToken = null;
        if (rememberMe) {
            refreshToken = jwt.sign(payload, env.jwtRefreshSecret, {
                expiresIn: "30d",
            });
        }

        const sessionId = await this.startSession(user.id);
        return { user, token: accessToken, sessionId, refreshToken };
    }

    private buildSocialUsername(profile: SocialAuthProfile) {
        const baseName = profile.displayName || profile.firstName || profile.email.split("@")[0] || "customer";
        const normalizedBase = baseName
            .toLowerCase()
            .replace(/[^a-z0-9._-]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 8) || "customer".slice(0, 8);
        const suffix = profile.providerId.slice(-6).toLowerCase();

        return `g${normalizedBase}${suffix}`.slice(0, 16);
    }

    private async createSocialUser(profile: SocialAuthProfile) {
        const uid = crypto.randomUUID();
        const placeholderPassword = await hashPassword(crypto.randomBytes(24).toString("hex"));
        const username = this.buildSocialUsername(profile);

        await usersRepository.createSocialUser(
            uid,
            username,
            profile.email,
            placeholderPassword,
            "Customer",
            profile.provider,
            profile.providerId,
        );

        return this.ensureFound(await usersRepository.findById(uid), "Unable to create social account");
    }

    async registerUser(uid: string, userData: RegisterUserInput) {
        const hashedPassword = await hashPassword(userData.password);
        await usersRepository.createUser(uid, userData.username, userData.email, hashedPassword, userData.role);

        const token = jwt.sign(
            { id: uid, email: userData.email, role: userData.role },
            env.jwtSecret,
            { expiresIn: "30d" },
        );

        await usersRepository.updateUserToken(uid, token);
        const sessionId = await this.startSession(uid);
        return { uid, token, sessionId };
    }

    async loginUser(uid: string, role?: string, rememberMe?: boolean) {
        const user = this.ensureFound(await usersRepository.findById(uid), "Invalid username, password, or role");

        if (role && user.role !== role) {
            throw new Error("Invalid username, password, or role");
        }

        if (user.status === "Suspended") {
            throw new Error("Account is suspended");
        }

        return this.issueLoginSession(user, rememberMe);
    }

    async loginWithSocialProfile(profile: SocialAuthProfile) {
        const socialUser = await usersRepository.findBySocialProvider(profile.provider, profile.providerId);
        if (socialUser) {
            if (socialUser.status === "Suspended") {
                throw new Error("Account is suspended");
            }
            if (socialUser.role === "Admin") {
                throw new Error("Admin accounts must use email login");
            }

            return this.issueLoginSession(socialUser, false);
        }

        const existingUser = await usersRepository.findByEmail(profile.email);
        if (existingUser) {
            if (existingUser.status === "Suspended") {
                throw new Error("Account is suspended");
            }
            if (existingUser.role === "Admin") {
                throw new Error("Admin accounts must use email login");
            }
            throw new Error("An account already exists with this email. Use email login to continue.");
        }

        return this.issueLoginSession(await this.createSocialUser(profile), false);
    }

    async refreshToken(oldRefreshToken: string): Promise<string> {
        return new Promise((resolve, reject) => {
            jwt.verify(oldRefreshToken, env.jwtRefreshSecret, (err, payload) => {
                if (err) return reject(err);
                const parsedPayload = payload as JwtPayload;
                const newAccess = jwt.sign(
                    { id: parsedPayload.id, email: parsedPayload.email, role: parsedPayload.role },
                    env.jwtSecret,
                    { expiresIn: "15m" },
                );

                resolve(newAccess);
            });
        });
    }

    async getCurrentUser(accessToken?: string, sessionId?: string) {
        if (!accessToken || !sessionId) {
            throw { status: 401, msg: "Not authenticated" };
        }

        let decoded: JwtPayload;
        try {
            decoded = jwt.verify(accessToken, env.jwtSecret) as JwtPayload;
        } catch {
            throw { status: 403, msg: "Invalid or expired token" };
        }

        const user = await usersRepository.findById(decoded.id);
        if (!user) {
            throw { status: 404, msg: "User not found" };
        }

        return user;
    }

    async requireAuthenticatedUser(req: Request) {
        const { valid, message } = await this.verifySessionToken(req);
        if (!valid) {
            throw new UnauthorizedError(message || "Not authenticated");
        }

        const accessToken = req.cookies.accessToken;
        const payload = jwt.verify(accessToken, env.jwtSecret) as JwtPayload & { role?: string };
        if (!payload.role && payload.id) {
            const user = await usersRepository.findById(payload.id);
            if (user?.role) {
                payload.role = user.role;
            }
        }

        return payload;
    }
}

export const authService = new AuthService();

