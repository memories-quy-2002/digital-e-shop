import { beforeEach, describe, expect, it, vi } from "vitest";
import http from "../../lib/http";
import {
    confirmEmailChange,
    confirmPasswordReset,
    loginUser,
    requestEmailChange,
    requestPasswordReset,
} from "./api";

vi.mock("../../lib/http", () => ({
    default: {
        post: vi.fn(),
    },
}));

describe("auth API", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(http.post).mockResolvedValue({ data: { userData: { id: "demo-user" } } } as never);
    });

    it("sends local email and password credentials to the login endpoint", async () => {
        await loginUser({ email: "demo.admin@digital-e.local", password: "DemoPass123!" }, true);

        expect(http.post).toHaveBeenCalledWith("/api/users/login", {
            email: "demo.admin@digital-e.local",
            password: "DemoPass123!",
            rememberMe: true,
        });
    });

    it("keeps the Firebase ID token login payload available for production", async () => {
        await loginUser({ idToken: "firebase-id-token" }, false);

        expect(http.post).toHaveBeenCalledWith("/api/users/login", {
            idToken: "firebase-id-token",
            rememberMe: false,
        });
    });

    it("requests a provider-aware password reset through the server", async () => {
        await requestPasswordReset("buyer@example.com");

        expect(http.post).toHaveBeenCalledWith("/api/users/password-reset/request", {
            email: "buyer@example.com",
        });
    });

    it("confirms a password reset and email change through token-protected endpoints", async () => {
        await confirmPasswordReset("reset-token", "NewPassword1!");
        await requestEmailChange("new@example.com");
        await confirmEmailChange("email-change-token");

        expect(http.post).toHaveBeenNthCalledWith(1, "/api/users/password-reset/confirm", {
            token: "reset-token",
            newPassword: "NewPassword1!",
        });
        expect(http.post).toHaveBeenNthCalledWith(2, "/api/users/email-change/request", {
            email: "new@example.com",
        });
        expect(http.post).toHaveBeenNthCalledWith(3, "/api/users/email-change/confirm", {
            token: "email-change-token",
        });
    });
});
