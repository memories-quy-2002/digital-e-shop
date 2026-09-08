import crypto from "crypto";
import jwt from "jsonwebtoken";
import type { Request } from "express";
import { Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { env } from "#src/config/env.config";
import { checkPassword, hashPassword } from "#src/utils/hashPassword";
import { UsersRepository } from "../users/users.repository";
import type { UserRow } from "../users/users.types";
import { toPublicUser } from "../users/user-public";
import type { RegisterUserInput } from "./auth.dto";
import type { AuthSessionPayload, JwtPayload } from "./auth.types";
import { AuthRepository } from "./auth.repository";
import { AuthSessionService } from "./auth-session.service";
import { FirebaseAdminAuthService } from "./firebase-admin.service";

@Injectable()
export class NestAuthService {
    constructor(
        private readonly authRepository: AuthRepository,
        private readonly usersRepository: UsersRepository,
        private readonly firebaseAdminAuthService: FirebaseAdminAuthService,
        private readonly authSessionService: AuthSessionService,
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
            const payload = jwt.verify(accessToken, env.jwtSecret) as Partial<JwtPayload>;
            if (!payload.sid || String(payload.sid) !== String(sessionId)) {
                return { valid: false, message: "Session mismatch" };
            }
            const session = await this.authRepository.getActiveSessionById(sessionId);

            if (!session || String(session.user_id) !== String(payload.id)) {
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

    private async issueLoginSession(user: UserRow, rememberMe = false): Promise<AuthSessionPayload> {
        return this.authSessionService.issue(user, rememberMe);
    }

    async registerUser(idToken: string, input: RegisterUserInput): Promise<AuthSessionPayload> {
        const identity = await this.firebaseAdminAuthService.verifyIdToken(idToken);
        const existing = await this.usersRepository.findById(identity.uid);
        if (existing && existing.email?.toLowerCase() !== identity.email) {
            throw new UnauthorizedException({ msg: "Account is not registered" });
        }
        if (existing?.status === "Suspended") {
            throw new UnauthorizedException({ msg: "Account is suspended" });
        }
        if (existing) return this.issueLoginSession(existing, false);

        const placeholderPassword = await hashPassword(crypto.randomBytes(32).toString("hex"));
        await this.usersRepository.createUser(
            identity.uid,
            input.username,
            identity.email,
            placeholderPassword,
            "Customer",
        );

        const created = await this.usersRepository.findById(identity.uid);
        if (!created) throw new NotFoundException({ msg: "Unable to create user" });
        return this.issueLoginSession(created, false);
    }

    async loginUser(idToken: string, rememberMe = false) {
        const identity = await this.firebaseAdminAuthService.verifyIdToken(idToken);
        const user = await this.usersRepository.findById(identity.uid);
        if (!user || user.email?.toLowerCase() !== identity.email) {
            throw new UnauthorizedException({ msg: "Account is not registered" });
        }
        if (user.status === "Suspended") {
            throw new UnauthorizedException({ msg: "Account is suspended" });
        }

        return this.issueLoginSession(user, rememberMe);
    }

    async loginWithPassword(email: string, password: string, rememberMe = false) {
        const normalizedEmail = email.trim().toLowerCase();
        const user = await this.usersRepository.findByEmail(normalizedEmail);
        const storedPassword = user?.password;
        const passwordMatches =
            typeof storedPassword === "string" && Boolean(await checkPassword(password, storedPassword));

        if (!user || !passwordMatches) {
            throw new UnauthorizedException({ msg: "Invalid email or password" });
        }
        if (user.status === "Suspended") {
            throw new UnauthorizedException({ msg: "Account is suspended" });
        }

        return this.issueLoginSession(user, rememberMe);
    }

    async refreshToken(sessionId: number | string, rawRefreshToken: string) {
        return this.authSessionService.rotate(sessionId, rawRefreshToken);
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

        return toPublicUser(user);
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
