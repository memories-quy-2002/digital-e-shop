import { beforeEach, describe, expect, it, vi } from "vitest";
import { UnauthorizedException } from "@nestjs/common";
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

function buildAuthService() {
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
    (service as unknown as { issueLoginSession: typeof issueLoginSession }).issueLoginSession = issueLoginSession;

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

    it("requires a Firebase ID token and rejects client-controlled login identity fields", () => {
        expect(() => userLoginSchema.parse({ uid: "forged", role: "Admin" })).toThrow();
        expect(() => userLoginSchema.parse({ idToken: "firebase-id-token", role: "Admin" })).toThrow();
        expect(userLoginSchema.parse({ idToken: "firebase-id-token", rememberMe: true })).toEqual({
            idToken: "firebase-id-token",
            rememberMe: true,
        });
    });

    it("accepts only a username alongside the Firebase ID token for registration", () => {
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
