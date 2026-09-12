import crypto from "crypto";
import jwt from "jsonwebtoken";
import type { Request } from "express";
import { ConflictException, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { env } from "#src/config/env.config";
import { UsersRepository } from "../users/users.repository";
import type { UserRow } from "../users/users.types";
import { toPublicUser } from "../users/user-public";
import type { RegisterUserInput } from "./auth.dto";
import type { AuthSessionPayload, JwtPayload } from "./auth.types";
import { AuthRepository } from "./auth.repository";
import { AuthSessionService } from "./auth-session.service";
import { FirebaseAdminAuthService, type FirebaseIdentity } from "./firebase-admin.service";

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

    private async issueRegistrationSession(user: UserRow): Promise<AuthSessionPayload> {
        return this.issueLoginSession(user, false);
    }

    private async reconcileFirebaseEmail(user: UserRow, identity: FirebaseIdentity): Promise<UserRow> {
        if (user.email?.toLowerCase() === identity.email) return user;
        if (
            !identity.emailVerified
            || user.auth_provider !== "firebase"
            || user.provider_user_id !== identity.uid
        ) {
            throw new UnauthorizedException({ msg: "Account is not registered" });
        }

        const existingEmail = await this.usersRepository.findByEmail(identity.email);
        if (existingEmail && String(existingEmail.id) !== String(user.id)) {
            throw new UnauthorizedException({ msg: "Account is not registered" });
        }

        const result = await this.usersRepository.syncFirebaseEmail(user.id, identity.email);
        if (!result?.affectedRows) {
            throw new UnauthorizedException({ msg: "Account is not registered" });
        }

        return (await this.usersRepository.findById(user.id)) || {
            ...user,
            email: identity.email,
            email_verified_at: new Date(),
        };
    }

    async registerUser(idToken: string, input: RegisterUserInput): Promise<AuthSessionPayload> {
        const identity = await this.firebaseAdminAuthService.verifyIdToken(idToken);
        const existing = await this.usersRepository.findById(identity.uid);
        if (existing?.status === "Suspended") {
            throw new UnauthorizedException({ msg: "Account is suspended" });
        }
        if (existing) {
            const reconciled = await this.reconcileFirebaseEmail(existing, identity);
            if (identity.emailVerified && reconciled.email_verified_at === null && typeof this.usersRepository.markEmailVerified === "function") {
                await this.usersRepository.markEmailVerified(identity.uid);
            }
            const current = identity.emailVerified && typeof this.usersRepository.findById === "function"
                ? await this.usersRepository.findById(identity.uid)
                : existing;
            return this.issueRegistrationSession(current || existing);
        }

        const existingEmail = typeof this.usersRepository.findByEmail === "function"
            ? await this.usersRepository.findByEmail(identity.email)
            : null;
        if (existingEmail && String(existingEmail.id) !== String(identity.uid)) {
            throw new ConflictException({ msg: "An account already exists for this email", code: "EMAIL_IN_USE" });
        }
        const existingUsername = typeof this.usersRepository.findByUsername === "function"
            ? await this.usersRepository.findByUsername(input.username)
            : null;
        if (existingUsername && String(existingUsername.id) !== String(identity.uid)) {
            throw new ConflictException({ msg: "Username is already in use", code: "USERNAME_IN_USE" });
        }

        const firebasePasswordPlaceholder = crypto.randomBytes(32).toString("hex");
        await this.usersRepository.createUser(
            identity.uid,
            input.username,
            identity.email,
            firebasePasswordPlaceholder,
            "Customer",
        );

        if (typeof this.usersRepository.updateAuthIdentity === "function") {
            await this.usersRepository.updateAuthIdentity(identity.uid, "firebase", identity.uid);
        }
        if (identity.emailVerified && typeof this.usersRepository.markEmailVerified === "function") {
            await this.usersRepository.markEmailVerified(identity.uid);
        }

        const created = await this.usersRepository.findById(identity.uid);
        if (!created) throw new NotFoundException({ msg: "Unable to create user" });
        return this.issueRegistrationSession(created);
    }

    async loginUser(idToken: string, rememberMe = false) {
        const identity = await this.firebaseAdminAuthService.verifyIdToken(idToken);
        const user = await this.usersRepository.findById(identity.uid);
        if (!user) {
            throw new UnauthorizedException({ msg: "Account is not registered" });
        }
        if (user.status === "Suspended") {
            throw new UnauthorizedException({ msg: "Account is suspended" });
        }

        const reconciled = await this.reconcileFirebaseEmail(user, identity);
        if (identity.emailVerified && reconciled.email_verified_at === null && typeof this.usersRepository.markEmailVerified === "function") {
            await this.usersRepository.markEmailVerified(identity.uid);
            const refreshed = await this.usersRepository.findById(identity.uid);
            if (refreshed) return this.issueLoginSession(refreshed, rememberMe);
        }

        return this.issueLoginSession(reconciled, rememberMe);
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
