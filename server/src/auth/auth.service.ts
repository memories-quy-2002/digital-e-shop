import crypto from "crypto";
import jwt from "jsonwebtoken";
import type { Request } from "express";
import { ConflictException, Injectable, NotFoundException, Optional, UnauthorizedException } from "@nestjs/common";
import { env } from "#src/config/env.config";
import { checkPassword, hashPassword } from "#src/utils/hashPassword";
import { UsersRepository } from "../users/users.repository";
import type { UserRow } from "../users/users.types";
import { toPublicUser } from "../users/user-public";
import type { LocalRegisterUserInput, RegisterUserInput } from "./auth.dto";
import type { AuthSessionPayload, JwtPayload } from "./auth.types";
import { AuthRepository } from "./auth.repository";
import { AuthSessionService } from "./auth-session.service";
import { FirebaseAdminAuthService } from "./firebase-admin.service";
import { EmailVerificationService } from "./email-verification.service";

@Injectable()
export class NestAuthService {
    constructor(
        private readonly authRepository: AuthRepository,
        private readonly usersRepository: UsersRepository,
        private readonly firebaseAdminAuthService: FirebaseAdminAuthService,
        private readonly authSessionService: AuthSessionService,
        @Optional() private readonly emailVerificationService?: EmailVerificationService,
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
        const session = await this.issueLoginSession(user, false);
        if (this.emailVerificationService) {
            const verification = await this.emailVerificationService.createAndSend(user);
            session.verificationEmailSent = verification.sent;
        }
        return session;
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
        if (existing) {
            if (identity.emailVerified && typeof this.usersRepository.markEmailVerified === "function") {
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

        const placeholderPassword = await hashPassword(crypto.randomBytes(32).toString("hex"));
        await this.usersRepository.createUser(
            identity.uid,
            input.username,
            identity.email,
            placeholderPassword,
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

    async registerLocalUser(input: LocalRegisterUserInput): Promise<AuthSessionPayload> {
        const email = input.email.trim().toLowerCase();
        const username = input.username.trim();
        const [existingEmail, existingUsername] = await Promise.all([
            this.usersRepository.findByEmail(email),
            typeof this.usersRepository.findByUsername === "function"
                ? this.usersRepository.findByUsername(username)
                : Promise.resolve(null),
        ]);

        if (existingEmail) {
            throw new ConflictException({ msg: "An account already exists for this email", code: "EMAIL_IN_USE" });
        }
        if (existingUsername) {
            throw new ConflictException({ msg: "Username is already in use", code: "USERNAME_IN_USE" });
        }

        const userId = crypto.randomUUID();
        const passwordHash = await hashPassword(input.password);
        await this.usersRepository.createLocalUser(userId, username, email, passwordHash, "Customer");
        const created = await this.usersRepository.findById(userId);
        if (!created) throw new NotFoundException({ msg: "Unable to create user" });
        return this.issueRegistrationSession(created);
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

        if (identity.emailVerified && user.email_verified_at === null && typeof this.usersRepository.markEmailVerified === "function") {
            await this.usersRepository.markEmailVerified(identity.uid);
            const refreshed = await this.usersRepository.findById(identity.uid);
            if (refreshed) return this.issueLoginSession(refreshed, rememberMe);
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
