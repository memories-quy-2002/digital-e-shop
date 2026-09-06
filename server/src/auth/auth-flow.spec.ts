import { beforeEach, describe, expect, it, vi } from "vitest";
import { UnauthorizedException } from "@nestjs/common";
import jwt from "jsonwebtoken";
import { env } from "#src/config/env.config";
import { NestAuthController } from "./auth.controller";
import { registerUserSchema, userLoginSchema } from "./auth.validator";
import { NestAuthService } from "./auth.service";
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
        updateUserToken: vi.fn(),
        createUser: vi.fn(),
    };
    const firebaseAdminAuthService = {
        verifyIdToken: vi.fn(),
    };
    const service = new NestAuthService(
        authRepository as never,
        usersRepository as never,
        firebaseAdminAuthService as never,
    );
    const issueLoginSession = vi.fn();
    if (options.stubIssueLoginSession !== false) {
        (service as unknown as { issueLoginSession: typeof issueLoginSession }).issueLoginSession = issueLoginSession;
    }

    return { service, usersRepository, firebaseAdminAuthService, issueLoginSession };
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

    it("clears a remembered refresh cookie before setting a non-remembered login", async () => {
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
                refreshToken: null,
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

        expect(response.clearCookie).toHaveBeenCalledWith(
            "refreshToken",
            expect.objectContaining({ httpOnly: true, secure: false, sameSite: "lax" }),
        );
        const lastResponse = response.json.mock.calls.at(-1)?.[0];
        expect(lastResponse).not.toHaveProperty("refreshToken");
    });

    it("sets a session access cookie when refreshing an access token", async () => {
        authService.refreshToken.mockResolvedValue("refreshed-access-token");
        const response = mockResponse();

        await controller.userRefreshToken(
            { requestId: "auth-refresh-cookie-1", cookies: { refreshToken: "refresh-token" } } as never,
            response as never,
        );

        expect(response.cookie).toHaveBeenCalledWith(
            "accessToken",
            "refreshed-access-token",
            expect.objectContaining({
                httpOnly: true,
                secure: false,
                sameSite: "lax",
            }),
        );
        expect(response.cookie.mock.calls[0][2]).not.toHaveProperty("maxAge");
        expect(response.json).toHaveBeenCalledWith({
            token: "refreshed-access-token",
            msg: "Token refreshed successfully",
            success: true,
            requestId: "auth-refresh-cookie-1",
        });
    });

    it("keeps registration cookies session-scoped and does not set a refresh cookie", async () => {
        authService.registerUser.mockResolvedValue({
            user: { id: "firebase-uid", email: "customer@example.com", role: "Customer" },
            token: "access-token",
            sessionId: 42,
            refreshToken: null,
        });
        const response = mockResponse();

        await controller.registerUser(
            { idToken: "firebase-id-token", user: { username: "new-user" } } as never,
            { requestId: "auth-register-cookie-1" } as never,
            response as never,
        );

        expect(response.cookie).toHaveBeenCalledTimes(3);
        for (const [, , options] of response.cookie.mock.calls) {
            expect(options).toEqual(expect.objectContaining({
                httpOnly: true,
                secure: false,
                sameSite: "lax",
            }));
            expect(options).not.toHaveProperty("maxAge");
        }
        expect(response.cookie).not.toHaveBeenCalledWith("refreshToken", expect.anything(), expect.anything());
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

    it("rejects a verified token when its email does not match the account", async () => {
        const { service, usersRepository, firebaseAdminAuthService, issueLoginSession } = buildAuthService();
        firebaseAdminAuthService.verifyIdToken.mockResolvedValue({ uid: "firebase-uid", email: "token@example.com" });
        usersRepository.findById.mockResolvedValue({ id: "firebase-uid", email: "account@example.com", role: "Customer" });

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

    it("keeps the access JWT at 15 minutes when remember-me is enabled", async () => {
        const { service, usersRepository, firebaseAdminAuthService } = buildAuthService({
            stubIssueLoginSession: false,
        });
        const user = {
            id: "firebase-uid",
            email: "customer@example.com",
            role: "Customer",
        };
        const originalJwtSecret = env.jwtSecret;
        const originalJwtRefreshSecret = env.jwtRefreshSecret;
        env.jwtSecret = "test-access-secret";
        env.jwtRefreshSecret = "test-refresh-secret";
        firebaseAdminAuthService.verifyIdToken.mockResolvedValue({
            uid: "firebase-uid",
            email: "customer@example.com",
        });
        usersRepository.findById.mockResolvedValue(user);

        try {
            const session = await service.loginUser("firebase-id-token", true);
            const accessPayload = jwt.decode(session.token) as jwt.JwtPayload;
            const refreshPayload = jwt.decode(session.refreshToken as string) as jwt.JwtPayload;

            expect(accessPayload.exp! - accessPayload.iat!).toBe(15 * 60);
            expect(refreshPayload.exp! - refreshPayload.iat!).toBe(30 * 24 * 60 * 60);
        } finally {
            env.jwtSecret = originalJwtSecret;
            env.jwtRefreshSecret = originalJwtRefreshSecret;
        }
    });

    it("reloads current database identity before issuing an access token on refresh", async () => {
        const { service, usersRepository } = buildAuthService();
        const currentUser = {
            id: "firebase-uid",
            email: "current@example.com",
            role: "Customer",
            status: "Active",
        };
        usersRepository.findById.mockResolvedValue(currentUser);
        const originalJwtSecret = env.jwtSecret;
        const originalJwtRefreshSecret = env.jwtRefreshSecret;
        env.jwtSecret = "test-access-secret";
        env.jwtRefreshSecret = "test-refresh-secret";

        try {
            const refreshToken = jwt.sign(
                { id: "firebase-uid", email: "stale@example.com", role: "Admin" },
                env.jwtRefreshSecret,
                { expiresIn: "30d" },
            );
            const accessToken = await service.refreshToken(refreshToken);
            const accessPayload = jwt.verify(accessToken, env.jwtSecret) as jwt.JwtPayload;

            expect(usersRepository.findById).toHaveBeenCalledWith("firebase-uid");
            expect(accessPayload).toMatchObject({
                id: currentUser.id,
                email: currentUser.email,
                role: currentUser.role,
            });
        } finally {
            env.jwtSecret = originalJwtSecret;
            env.jwtRefreshSecret = originalJwtRefreshSecret;
        }
    });

    it("rejects refresh for a missing database user", async () => {
        const { service, usersRepository } = buildAuthService();
        usersRepository.findById.mockResolvedValue(null);
        const originalJwtSecret = env.jwtSecret;
        const originalJwtRefreshSecret = env.jwtRefreshSecret;
        env.jwtSecret = "test-access-secret";
        env.jwtRefreshSecret = "test-refresh-secret";

        try {
            const refreshToken = jwt.sign({ id: "missing-user" }, env.jwtRefreshSecret, { expiresIn: "30d" });
            await expect(service.refreshToken(refreshToken)).rejects.toBeInstanceOf(UnauthorizedException);
        } finally {
            env.jwtSecret = originalJwtSecret;
            env.jwtRefreshSecret = originalJwtRefreshSecret;
        }
    });

    it("rejects refresh for a suspended database user", async () => {
        const { service, usersRepository } = buildAuthService();
        usersRepository.findById.mockResolvedValue({
            id: "suspended-user",
            email: "suspended@example.com",
            role: "Customer",
            status: "Suspended",
        });
        const originalJwtSecret = env.jwtSecret;
        const originalJwtRefreshSecret = env.jwtRefreshSecret;
        env.jwtSecret = "test-access-secret";
        env.jwtRefreshSecret = "test-refresh-secret";

        try {
            const refreshToken = jwt.sign({ id: "suspended-user" }, env.jwtRefreshSecret, { expiresIn: "30d" });
            await expect(service.refreshToken(refreshToken)).rejects.toBeInstanceOf(UnauthorizedException);
        } finally {
            env.jwtSecret = originalJwtSecret;
            env.jwtRefreshSecret = originalJwtRefreshSecret;
        }
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
