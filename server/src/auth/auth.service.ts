import crypto from "crypto";
import jwt from "jsonwebtoken";
import type { Request } from "express";
import { Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { env } from "#src/config/env.config";
import { hashPassword } from "#src/utils/hashPassword";
import { UsersRepository } from "../users/users.repository";
import type { UserRow } from "../users/users.types";
import type { RegisterUserInput } from "./auth.dto";
import type { AuthSessionPayload, JwtPayload, SocialAuthProfile } from "./auth.types";
import { AuthRepository } from "./auth.repository";

@Injectable()
export class NestAuthService {
    constructor(
        private readonly authRepository: AuthRepository,
        private readonly usersRepository: UsersRepository,
    ) {}

    async startSession(userId: string) {
        return this.authRepository.startSession(userId);
    }

    async verifySessionToken(req: Request): Promise<{ valid: boolean; message?: string }> {
        const sessionId = req.cookies.session;
        const accessToken = req.cookies.accessToken;

        if (!sessionId || !accessToken) {
            return { valid: false, message: "Missing session or access token" };
        }

        try {
            jwt.verify(accessToken, env.jwtSecret);
            const session = await this.authRepository.getSessionById(sessionId);

            if (!session) {
                return { valid: false, message: "Session not found" };
            }

            return { valid: true };
        } catch {
            return { valid: false, message: "Session invalid or expired" };
        }
    }

    async endSession(sessionId: number | string) {
        const session = await this.authRepository.getSessionById(sessionId);
        if (!session || !session.session_start) {
            return null;
        }

        const sessionEnd = new Date();
        await this.authRepository.updateSession(sessionId, sessionEnd);
        return { sessionEnd };
    }

    private async issueLoginSession(user: UserRow, rememberMe?: boolean): Promise<AuthSessionPayload> {
        const payload = { id: user.id, email: user.email, role: user.role } as JwtPayload;
        const accessToken = jwt.sign(payload, env.jwtSecret, {
            expiresIn: rememberMe ? "30d" : "15m",
        });

        await this.usersRepository.updateUserToken(user.id, accessToken);

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

        await this.usersRepository.createSocialUser(
            uid,
            username,
            profile.email,
            placeholderPassword,
            "Customer",
            profile.provider,
            profile.providerId,
        );

        const created = await this.usersRepository.findById(uid);
        if (!created) throw new NotFoundException("Unable to create social account");
        return created;
    }

    async registerUser(uid: string, userData: RegisterUserInput) {
        const hashedPassword = await hashPassword(userData.password);
        await this.usersRepository.createUser(uid, userData.username, userData.email, hashedPassword, userData.role);

        const token = jwt.sign(
            { id: uid, email: userData.email, role: userData.role },
            env.jwtSecret,
            { expiresIn: "30d" },
        );

        await this.usersRepository.updateUserToken(uid, token);
        const sessionId = await this.startSession(uid);
        return { uid, token, sessionId };
    }

    async loginUser(uid: string, role?: string, rememberMe?: boolean) {
        const user = await this.usersRepository.findById(uid);
        if (!user) throw new Error("Invalid username, password, or role");

        if (role && user.role !== role) {
            throw new Error("Invalid username, password, or role");
        }

        if (user.status === "Suspended") {
            throw new Error("Account is suspended");
        }

        return this.issueLoginSession(user, rememberMe);
    }

    async loginWithSocialProfile(profile: SocialAuthProfile) {
        const socialUser = await this.usersRepository.findBySocialProvider(profile.provider, profile.providerId);
        if (socialUser) {
            if (socialUser.status === "Suspended") {
                throw new Error("Account is suspended");
            }
            if (socialUser.role === "Admin") {
                throw new Error("Admin accounts must use email login");
            }

            return this.issueLoginSession(socialUser, false);
        }

        const existingUser = await this.usersRepository.findByEmail(profile.email);
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
            throw new UnauthorizedException({ msg: "Not authenticated" });
        }

        let decoded: JwtPayload;
        try {
            decoded = jwt.verify(accessToken, env.jwtSecret) as JwtPayload;
        } catch {
            throw new UnauthorizedException({ msg: "Invalid or expired token" });
        }

        const user = await this.usersRepository.findById(decoded.id);
        if (!user) {
            throw new NotFoundException({ msg: "User not found" });
        }

        return user;
    }

    async requireAuthenticatedUser(req: Request) {
        const { valid, message } = await this.verifySessionToken(req);
        if (!valid) {
            throw new UnauthorizedException(message || "Not authenticated");
        }

        const accessToken = req.cookies.accessToken;
        const payload = jwt.verify(accessToken, env.jwtSecret) as JwtPayload & { role?: string };
        if (!payload.role && payload.id) {
            const user = await this.usersRepository.findById(payload.id);
            if (user?.role) {
                payload.role = user.role;
            }
        }

        return payload;
    }
}
