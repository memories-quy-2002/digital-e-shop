import { beforeEach, describe, expect, it, vi } from "vitest";
import { UnauthorizedException } from "@nestjs/common";
import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import { env } from "#src/config/env.config";
import { NestAuthController } from "./auth.controller";
import { registerUserSchema, userLoginSchema } from "./auth.validator";
import { NestAuthService } from "./auth.service";
import { AuthSessionService } from "./auth-session.service";
import { FirebaseAdminAuthService } from "./firebase-admin.service";

function mockResponse() {
    const response = {
        status: vi.fn(),
        json: vi.fn(),
        cookie: vi.fn(),
        clearCookie: vi.fn(),
    };
    response.status.mockReturnValue(response);
    response.json.mockReturnValue(response);
    return response;
}

function buildAuthService(options: { stubIssueLoginSession?: boolean } = {}) {
    const authRepository = {
        startSession: vi.fn().mockResolvedValue(42),
    };
    const usersRepository = {
        findById: vi.fn(),
        findByEmail: vi.fn(),
        findByUsername: vi.fn(),
        updateUserToken: vi.fn(),
        createUser: vi.fn(),
        updateAuthIdentity: vi.fn(),
        markEmailVerified: vi.fn(),
        syncFirebaseEmail: vi.fn(),
    };
    const firebaseAdminAuthService = {
        verifyIdToken: vi.fn(),
    };
    const authSessionService = {
        issue: vi.fn(),
        rotate: vi.fn(),
    };
    const service = new NestAuthService(
        authRepository as never,
        usersRepository as never,
        firebaseAdminAuthService as never,
        authSessionService as never,
    );
    const issueLoginSession = vi.fn();
    if (options.stubIssueLoginSession !== false) {
        (service as unknown as { issueLoginSession: typeof issueLoginSession }).issueLoginSession = issueLoginSession;
    }

    return { service, usersRepository, firebaseAdminAuthService, authSessionService, issueLoginSession };
}

describe("authentication flow response contract", () => {
    let authService: {
        verifySessionToken: ReturnType<typeof vi.fn>;
        refreshToken: ReturnType<typeof vi.fn>;
        loginUser: ReturnType<typeof vi.fn>;
        registerUser: ReturnType<typeof vi.fn>;
    };
    let controller: NestAuthController;

    beforeEach(() => {
        authService = {
            verifySessionToken: vi.fn(),
            refreshToken: vi.fn(),
            loginUser: vi.fn(),
            registerUser: vi.fn(),
        };
        controller = new NestAuthController(authService as unknown as NestAuthService);
    });

    it("rejects client-controlled login identity fields", () => {
        expect(() => userLoginSchema.parse({ uid: "forged", role: "Admin" })).toThrow();
        expect(() => userLoginSchema.parse({ idToken: "firebase-id-token", role: "Admin" })).toThrow();
        expect(userLoginSchema.parse({ idToken: "firebase-id-token", rememberMe: true })).toEqual({
            idToken: "firebase-id-token",
            rememberMe: true,
        });
    });

    it("rejects login when the Firebase ID token is missing", () => {
        expect(() => userLoginSchema.parse({ rememberMe: false })).toThrow();
    });

    it("rejects local credentials because Firebase is the only authentication provider", () => {
        expect(() => userLoginSchema.parse({
            email: "demo.admin@digital-e.local",
            password: "DemoPass123!",
            rememberMe: true,
        })).toThrow();
        expect(() => registerUserSchema.parse({
            email: "customer@example.com",
            password: "Password1!",
            user: { username: "customer" },
        })).toThrow();
    });

    it("rejects client-controlled registration identity fields", () => {
        expect(() => registerUserSchema.parse({
            uid: "forged",
            user: {
                username: "attacker",
                email: "attacker@example.com",
                password: "Password1!",
                role: "Admin",
            },
        })).toThrow();

        expect(registerUserSchema.parse({
            idToken: "firebase-id-token",
            user: { username: "attacker" },
        })).toEqual({
            idToken: "firebase-id-token",
            user: { username: "attacker" },
        });
    });

    it("rejects registration when the Firebase ID token is missing", () => {
        expect(() => registerUserSchema.parse({ user: { username: "attacker" } })).toThrow();
    });

    it("passes the Firebase ID token to the login service without a client role", async () => {
        authService.loginUser.mockResolvedValue({
            user: { id: "firebase-uid", email: "customer@example.com", role: "Customer" },
            token: "access-token",
            sessionId: 42,
            refreshToken: null,
        });
        const response = mockResponse();

        await controller.userLogin({ idToken: "firebase-id-token", rememberMe: true } as never, { requestId: "auth-login-1" } as never, response as never);

        expect(authService.loginUser).toHaveBeenCalledWith("firebase-id-token", true);
    });

    it("passes only the Firebase ID token and username to the registration service", async () => {
        authService.registerUser.mockResolvedValue({
            user: { id: "firebase-uid", email: "customer@example.com", role: "Customer" },
            token: "access-token",
            sessionId: 42,
            refreshToken: null,
        });
        const response = mockResponse();

        await controller.registerUser({ idToken: "firebase-id-token", user: { username: "attacker" } } as never, { requestId: "auth-register-1" } as never, response as never);

        expect(authService.registerUser).toHaveBeenCalledWith("firebase-id-token", { username: "attacker" });
    });

    it("does not expose a server-owned verification delivery result", async () => {
        authService.registerUser.mockResolvedValue({
            user: { id: "firebase-uid", email: "customer@example.com", role: "Customer", email_verified: false },
            token: "access-token",
            sessionId: 42,
            refreshToken: null,
        });
        const response = mockResponse();

        await controller.registerUser(
            { idToken: "firebase-id-token", user: { username: "customer" } } as never,
            { requestId: "auth-register-firebase-verification-1" } as never,
            response as never,
        );

        expect(response.json.mock.calls.at(-1)?.[0]).not.toHaveProperty("verification_email_sent");
    });

    it("sets a session-scoped refresh cookie for a non-remembered login", async () => {
        authService.loginUser
            .mockResolvedValueOnce({
                user: { id: "firebase-uid", email: "customer@example.com", role: "Customer" },
                token: "remembered-access-token",
                sessionId: 42,
                refreshToken: "refresh-token",
            })
            .mockResolvedValueOnce({
                user: { id: "firebase-uid", email: "customer@example.com", role: "Customer" },
                token: "session-access-token",
                sessionId: 43,
                refreshToken: "session-refresh-token",
            });
        const response = mockResponse();

        await controller.userLogin(
            { idToken: "firebase-id-token", rememberMe: true } as never,
            { requestId: "auth-remembered-login-1" } as never,
            response as never,
        );
        await controller.userLogin(
            { idToken: "firebase-id-token", rememberMe: false } as never,
            { requestId: "auth-session-login-1" } as never,
            response as never,
        );

        const refreshCookies = response.cookie.mock.calls.filter(([name]) => name === "refreshToken");
        expect(refreshCookies).toHaveLength(2);
        expect(refreshCookies.at(-1)?.[2]).not.toHaveProperty("maxAge");
        const lastResponse = response.json.mock.calls.at(-1)?.[0];
        expect(lastResponse).not.toHaveProperty("refreshToken");
    });

    it("keeps session cookies session-scoped when remember-me is enabled", async () => {
        authService.loginUser.mockResolvedValue({
            user: { id: "firebase-uid", email: "customer@example.com", role: "Customer" },
            token: "access-token",
            sessionId: 42,
            refreshToken: "refresh-token",
        });
        const response = mockResponse();

        await controller.userLogin(
            { idToken: "firebase-id-token", rememberMe: true } as never,
            { requestId: "auth-remembered-cookie-1" } as never,
            response as never,
        );

        const cookiesByName = new Map(response.cookie.mock.calls.map(([name, , options]) => [name, options]));
        expect(cookiesByName.get("session")).not.toHaveProperty("maxAge");
        expect(cookiesByName.get("userInfo")).not.toHaveProperty("maxAge");
        expect(cookiesByName.get("accessToken")).not.toHaveProperty("maxAge");
        expect(cookiesByName.get("refreshToken")).toEqual(expect.objectContaining({ maxAge: 30 * 24 * 60 * 60 * 1000 }));
    });

    it("sets a session access cookie when refreshing an access token", async () => {
        authService.refreshToken.mockResolvedValue({
            accessToken: "refreshed-access-token",
            refreshToken: "rotated-refresh-token",
            rememberMe: false,
        });
        const response = mockResponse();

        await controller.userRefreshToken(
            { requestId: "auth-refresh-cookie-1", cookies: { session: "42", refreshToken: "refresh-token" } } as never,
            response as never,
        );

        expect(authService.refreshToken).toHaveBeenCalledWith("42", "refresh-token");

        expect(response.cookie).toHaveBeenCalledWith(
            "accessToken",
            "refreshed-access-token",
            expect.objectContaining({
                httpOnly: true,
                secure: false,
                sameSite: "lax",
            }),
        );
        expect(response.cookie).toHaveBeenCalledWith(
            "refreshToken",
            "rotated-refresh-token",
            expect.objectContaining({ httpOnly: true, secure: false, sameSite: "lax" }),
        );
        expect(response.cookie.mock.calls[1][2]).not.toHaveProperty("maxAge");
        expect(response.json).toHaveBeenCalledWith({
            msg: "Token refreshed successfully",
            success: true,
            requestId: "auth-refresh-cookie-1",
        });
    });

    it("clears the refresh cookie when refreshing an access token fails", async () => {
        authService.refreshToken.mockRejectedValue(new UnauthorizedException({ msg: "Invalid refresh token" }));
        const response = mockResponse();

        await controller.userRefreshToken(
            { requestId: "auth-refresh-failure-1", cookies: { session: "42", refreshToken: "invalid-refresh-token" } } as never,
            response as never,
        );

        expect(response.clearCookie).toHaveBeenCalledWith(
            "refreshToken",
            expect.objectContaining({ httpOnly: true, secure: false, sameSite: "lax" }),
        );
        expect(response.status).toHaveBeenCalledWith(403);
    });

    it("keeps registration cookies session-scoped and sets a session refresh cookie", async () => {
        authService.registerUser.mockResolvedValue({
            user: { id: "firebase-uid", email: "customer@example.com", role: "Customer" },
            token: "access-token",
            sessionId: 42,
            refreshToken: "refresh-token",
        });
        const response = mockResponse();

        await controller.registerUser(
            { idToken: "firebase-id-token", user: { username: "new-user" } } as never,
            { requestId: "auth-register-cookie-1" } as never,
            response as never,
        );

        expect(response.cookie).toHaveBeenCalledTimes(4);
        for (const [, , options] of response.cookie.mock.calls) {
            expect(options).toEqual(expect.objectContaining({
                httpOnly: true,
                secure: false,
                sameSite: "lax",
            }));
            expect(options).not.toHaveProperty("maxAge");
        }
        expect(response.cookie).toHaveBeenCalledWith("refreshToken", "refresh-token", expect.anything());
    });

    it("returns canonical success metadata when the customer session is valid", async () => {
        authService.verifySessionToken.mockResolvedValue({ valid: true });
        const response = mockResponse();

        await controller.checkSession({ requestId: "auth-session-1" } as never, response as never);

        expect(response.json).toHaveBeenCalledWith({
            sessionActive: true,
            msg: "Session is valid",
            success: true,
            requestId: "auth-session-1",
        });
    });

    it("returns canonical error metadata when refresh token is missing", async () => {
        const response = mockResponse();

        await controller.userRefreshToken({ requestId: "auth-refresh-1", cookies: {} } as never, response as never);

        expect(response.status).toHaveBeenCalledWith(401);
        expect(response.json).toHaveBeenCalledWith({
            success: false,
            error: "No refresh token",
            msg: "No refresh token",
            code: "UNAUTHORIZED",
            requestId: "auth-refresh-1",
        });
    });
});

describe("Firebase identity boundary", () => {
    it("looks up the account by the verified UID and does not accept a client role", async () => {
        const { service, usersRepository, firebaseAdminAuthService, issueLoginSession } = buildAuthService();
        const user = { id: "firebase-uid", email: "customer@example.com", role: "Customer" };
        const session = { user, token: "access-token", sessionId: 42, refreshToken: null as string | null };
        firebaseAdminAuthService.verifyIdToken.mockResolvedValue({
            uid: "firebase-uid",
            email: "customer@example.com",
        });
        usersRepository.findById.mockResolvedValue(user);
        issueLoginSession.mockResolvedValue(session);

        await expect(service.loginUser("firebase-id-token", true)).resolves.toBe(session);

        expect(firebaseAdminAuthService.verifyIdToken).toHaveBeenCalledWith("firebase-id-token");
        expect(usersRepository.findById).toHaveBeenCalledWith("firebase-uid");
        expect(issueLoginSession).toHaveBeenCalledWith(user, true);
    });

    it("synchronizes a verified Firebase claim before issuing the session", async () => {
        const { service, usersRepository, firebaseAdminAuthService, issueLoginSession } = buildAuthService();
        const user = {
            id: "firebase-uid",
            email: "customer@example.com",
            role: "Customer",
            email_verified_at: null as Date | null,
        };
        const refreshedUser = {
            ...user,
            email_verified_at: new Date(),
        };
        const session = { user: refreshedUser, token: "access-token", sessionId: 42, refreshToken: null as string | null };
        firebaseAdminAuthService.verifyIdToken.mockResolvedValue({
            uid: "firebase-uid",
            email: "customer@example.com",
            emailVerified: true,
        });
        usersRepository.findById.mockResolvedValueOnce(user).mockResolvedValueOnce(refreshedUser);
        issueLoginSession.mockResolvedValue(session);

        await expect(service.loginUser("firebase-id-token")).resolves.toBe(session);

        expect(usersRepository.markEmailVerified).toHaveBeenCalledWith("firebase-uid");
        expect(issueLoginSession).toHaveBeenCalledWith(refreshedUser, false);
    });

    it("synchronizes a verified Firebase email change by UID before issuing the session", async () => {
        const { service, usersRepository, firebaseAdminAuthService, issueLoginSession } = buildAuthService();
        const user = {
            id: "firebase-uid",
            email: "old@example.com",
            auth_provider: "firebase",
            provider_user_id: "firebase-uid",
            role: "Customer",
            email_verified_at: new Date(),
        };
        const refreshedUser = { ...user, email: "new@example.com" };
        const session = { user: refreshedUser, token: "access-token", sessionId: 42, refreshToken: null as string | null };
        firebaseAdminAuthService.verifyIdToken.mockResolvedValue({
            uid: "firebase-uid",
            email: "new@example.com",
            emailVerified: true,
        });
        usersRepository.findById.mockResolvedValueOnce(user).mockResolvedValueOnce(refreshedUser);
        usersRepository.findByEmail.mockResolvedValue(null);
        usersRepository.syncFirebaseEmail.mockResolvedValue({ affectedRows: 1 });
        issueLoginSession.mockResolvedValue(session);

        await expect(service.loginUser("firebase-id-token")).resolves.toBe(session);

        expect(usersRepository.syncFirebaseEmail).toHaveBeenCalledWith("firebase-uid", "new@example.com");
        expect(issueLoginSession).toHaveBeenCalledWith(refreshedUser, false);
    });

    it("rejects a verified token when its email does not match the account", async () => {
        const { service, usersRepository, firebaseAdminAuthService, issueLoginSession } = buildAuthService();
        firebaseAdminAuthService.verifyIdToken.mockResolvedValue({ uid: "firebase-uid", email: "token@example.com" });
        usersRepository.findById.mockResolvedValue({ id: "firebase-uid", email: "account@example.com", role: "Customer" });

        await expect(service.loginUser("firebase-id-token")).rejects.toBeInstanceOf(UnauthorizedException);
        expect(issueLoginSession).not.toHaveBeenCalled();
    });

    it("rejects registration when an existing UID has a different database email", async () => {
        const { service, usersRepository, firebaseAdminAuthService, issueLoginSession } = buildAuthService();
        firebaseAdminAuthService.verifyIdToken.mockResolvedValue({ uid: "firebase-uid", email: "token@example.com" });
        usersRepository.findById.mockResolvedValue({ id: "firebase-uid", email: "account@example.com", role: "Customer" });

        await expect(service.registerUser("firebase-id-token", { username: "existing-user" }))
            .rejects.toBeInstanceOf(UnauthorizedException);
        expect(issueLoginSession).not.toHaveBeenCalled();
    });

    it("rejects login for a suspended account", async () => {
        const { service, usersRepository, firebaseAdminAuthService, issueLoginSession } = buildAuthService();
        firebaseAdminAuthService.verifyIdToken.mockResolvedValue({ uid: "firebase-uid", email: "customer@example.com" });
        usersRepository.findById.mockResolvedValue({
            id: "firebase-uid",
            email: "customer@example.com",
            role: "Customer",
            status: "Suspended",
        });

        await expect(service.loginUser("firebase-id-token")).rejects.toBeInstanceOf(UnauthorizedException);
        expect(issueLoginSession).not.toHaveBeenCalled();
    });

    it("creates a public registration as Customer using verified identity fields", async () => {
        const { service, usersRepository, firebaseAdminAuthService, issueLoginSession } = buildAuthService();
        const createdUser = { id: "firebase-uid", email: "customer@example.com", role: "Customer" };
        firebaseAdminAuthService.verifyIdToken.mockResolvedValue({ uid: "firebase-uid", email: "customer@example.com" });
        usersRepository.findById.mockResolvedValueOnce(null).mockResolvedValueOnce(createdUser);
        issueLoginSession.mockResolvedValue({ user: createdUser, token: "access-token", sessionId: 42, refreshToken: null as string | null });

        await service.registerUser("firebase-id-token", { username: "new-user", role: "Admin" } as never);

        expect(usersRepository.createUser).toHaveBeenCalledWith(
            "firebase-uid",
            "new-user",
            "customer@example.com",
            expect.any(String),
            "Customer",
        );
        expect(issueLoginSession).toHaveBeenCalledWith(createdUser, false);
    });

    it("rejects a suspended existing account through registration", async () => {
        const { service, usersRepository, firebaseAdminAuthService, issueLoginSession } = buildAuthService();
        const suspendedUser = {
            id: "firebase-uid",
            email: "customer@example.com",
            role: "Customer",
            status: "Suspended",
        };
        firebaseAdminAuthService.verifyIdToken.mockResolvedValue({
            uid: "firebase-uid",
            email: "customer@example.com",
        });
        usersRepository.findById.mockResolvedValue(suspendedUser);

        await expect(service.registerUser("firebase-id-token", { username: "existing-user" }))
            .rejects.toBeInstanceOf(UnauthorizedException);

        expect(issueLoginSession).not.toHaveBeenCalled();
    });

    it("issues a 15-minute access JWT bound to a numeric session id and stores only a refresh hash", async () => {
        const authRepository = {
            startSession: vi.fn().mockResolvedValue(42),
        };
        const authSessionService = new AuthSessionService(authRepository as never, {} as never);
        const user = {
            id: "firebase-uid",
            email: "customer@example.com",
            role: "Customer",
        };
        const originalJwtSecret = env.jwtSecret;
        env.jwtSecret = "test-access-secret";
        const signSpy = vi.spyOn(jwt, "sign");

        try {
            const session = await authSessionService.issue(user, true);

            expect(signSpy).toHaveBeenCalledWith(
                expect.objectContaining({ sid: expect.any(Number) }),
                expect.any(String),
                expect.objectContaining({ expiresIn: "15m" }),
            );
            expect(session.refreshToken).toMatch(/^[A-Za-z0-9_-]{64}$/);
            expect(authRepository.startSession).toHaveBeenCalledWith(
                user.id,
                expect.stringMatching(/^[a-f0-9]{64}$/),
                expect.any(Date),
            );
            expect(authRepository.startSession.mock.calls[0][1]).not.toBe(session.refreshToken);
        } finally {
            env.jwtSecret = originalJwtSecret;
            signSpy.mockRestore();
        }
    });

    it("rejects the previous refresh token after a successful conditional rotation", async () => {
        const oldRefresh = "old-refresh-token";
        const oldHash = crypto.createHash("sha256").update(oldRefresh).digest("hex");
        const authRepository = {
            getActiveSessionById: vi.fn().mockResolvedValue({
                id: 42,
                user_id: "firebase-uid",
                refresh_token_hash: oldHash,
                refresh_expires_at: new Date(Date.now() + 60_000),
                revoked_at: null,
                session_end: null,
            }),
            rotateRefreshToken: vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false),
            revokeSession: vi.fn().mockResolvedValue(undefined),
        };
        const usersRepository = {
            findById: vi.fn().mockResolvedValue({
                id: "firebase-uid",
                email: "current@example.com",
                role: "Customer",
                status: "Active",
            }),
        };
        const authSessionService = new AuthSessionService(authRepository as never, usersRepository as never);
        const originalJwtSecret = env.jwtSecret;
        env.jwtSecret = "test-access-secret";

        try {
            await authSessionService.rotate(42, oldRefresh);
            await expect(authSessionService.rotate(42, oldRefresh)).rejects.toMatchObject({ status: 401 });
            expect(authRepository.rotateRefreshToken).toHaveBeenCalledWith(
                42,
                oldHash,
                expect.stringMatching(/^[a-f0-9]{64}$/),
                expect.any(Date),
            );
        } finally {
            env.jwtSecret = originalJwtSecret;
        }
    });

    it("passes the session id and raw cookie to refresh rotation", async () => {
        const { service, authSessionService } = buildAuthService();
        const rotated = { accessToken: "access", refreshToken: "refresh", rememberMe: false };
        authSessionService.rotate.mockResolvedValue(rotated);

        await expect(service.refreshToken("42", "raw-refresh-token")).resolves.toBe(rotated);
        expect(authSessionService.rotate).toHaveBeenCalledWith("42", "raw-refresh-token");
    });
});

describe("FirebaseAdminAuthService", () => {
    it("verifies revoked-token state and normalizes the verified email", async () => {
        const verifyIdToken = vi.fn().mockResolvedValue({ uid: "firebase-uid", email: "Customer@Example.com" });
        const service = new FirebaseAdminAuthService();
        (service as unknown as { getAuthClient: () => { verifyIdToken: typeof verifyIdToken } }).getAuthClient = () => ({ verifyIdToken });

        await expect(service.verifyIdToken("firebase-id-token")).resolves.toEqual({
            uid: "firebase-uid",
            email: "customer@example.com",
            emailVerified: false,
        });
        expect(verifyIdToken).toHaveBeenCalledWith("firebase-id-token", true);
    });

    it("maps Firebase verification failures to an unauthorized response", async () => {
        const verifyIdToken = vi.fn().mockRejectedValue(new Error("invalid token"));
        const service = new FirebaseAdminAuthService();
        (service as unknown as { getAuthClient: () => { verifyIdToken: typeof verifyIdToken } }).getAuthClient = () => ({ verifyIdToken });

        await expect(service.verifyIdToken("invalid-token")).rejects.toBeInstanceOf(UnauthorizedException);
    });
});
