import { describe, expect, it, vi } from "vitest";
import { env } from "#src/config/env.config";
import { AuthSessionService } from "./auth-session.service";

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
            const session = await service.issue({
                id: "user-1",
                email: "user@example.com",
                username: "user",
                role: "Customer",
                status: "Active",
                password: "hashed-password",
                token: "legacy-access-token",
                refresh_token: "legacy-refresh-token",
            }, false);

            expect(session.user).toEqual(expect.objectContaining({
                id: "user-1",
                email: "user@example.com",
                role: "Customer",
            }));
            expect(session.user).not.toHaveProperty("password");
            expect(session.user).not.toHaveProperty("token");
            expect(session.user).not.toHaveProperty("refresh_token");
        } finally {
            env.jwtSecret = originalJwtSecret;
        }
    });
});
