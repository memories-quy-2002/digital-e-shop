import { describe, expect, it, vi } from "vitest";
import jwt from "jsonwebtoken";
import { env } from "#src/config/env.config";
import { AuthSessionService } from "./auth-session.service";
import { NestAuthService } from "./auth.service";

const sensitiveUser = {
    id: "user-1",
    email: "user@example.com",
    username: "user",
    role: "Customer",
    status: "Active",
    password: "hashed-password",
    token: "legacy-access-token",
    refresh_token: "legacy-refresh-token",
};

const expectPublicUser = (user: Record<string, unknown>) => {
    expect(user).toEqual(expect.objectContaining({
        id: "user-1",
        email: "user@example.com",
        role: "Customer",
    }));
    expect(user).not.toHaveProperty("password");
    expect(user).not.toHaveProperty("token");
    expect(user).not.toHaveProperty("refresh_token");
};

describe("auth public user boundary", () => {
    it("does not expose credential or token fields in an issued session", async () => {
        const authRepository = {
            startSession: vi.fn().mockResolvedValue(42),
        };
        const usersRepository = {
            updateUserToken: vi.fn().mockResolvedValue(undefined),
        };
        const service = new AuthSessionService(authRepository as never, usersRepository as never);
        const originalJwtSecret = env.jwtSecret;
        env.jwtSecret = "test-access-secret";

        try {
            const session = await service.issue(sensitiveUser, false);
            expectPublicUser(session.user);
        } finally {
            env.jwtSecret = originalJwtSecret;
        }
    });

    it("does not expose credential or token fields from the current-user endpoint service", async () => {
        const usersRepository = {
            findById: vi.fn().mockResolvedValue(sensitiveUser),
        };
        const service = new NestAuthService(
            {} as never,
            usersRepository as never,
            {} as never,
            {} as never,
        );
        const originalJwtSecret = env.jwtSecret;
        env.jwtSecret = "test-access-secret";

        try {
            const accessToken = jwt.sign(
                { id: sensitiveUser.id, email: sensitiveUser.email, role: sensitiveUser.role, sid: 42 },
                env.jwtSecret,
                { expiresIn: "15m" },
            );
            const user = await service.getCurrentUser(accessToken, "42");
            expectPublicUser(user);
        } finally {
            env.jwtSecret = originalJwtSecret;
        }
    });
});
