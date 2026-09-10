import { beforeEach, describe, expect, it, vi } from "vitest";
import http from "../../lib/http";
import { confirmEmailVerification, registerUser, resendVerification } from "./api";

vi.mock("../../lib/http", () => ({
    default: { post: vi.fn() },
}));

describe("email verification auth API", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(http.post).mockResolvedValue({
            data: { userData: { id: "user-1" }, email_verified: false, verification_email_sent: true },
        } as never);
    });

    it("registers local credentials without routing a password through Firebase", async () => {
        await registerUser({
            email: "Customer@Example.com",
            password: "Password1!",
            user: { username: "customer" },
        });

        expect(http.post).toHaveBeenCalledWith("/api/users/register", {
            email: "Customer@Example.com",
            password: "Password1!",
            user: { username: "customer" },
        });
    });

    it("uses the server-owned verification endpoints", async () => {
        await resendVerification("customer@example.com");
        await confirmEmailVerification("raw-token");

        expect(http.post).toHaveBeenNthCalledWith(1, "/api/users/verification/resend", {
            email: "customer@example.com",
        });
        expect(http.post).toHaveBeenNthCalledWith(2, "/api/users/verification/confirm", {
            token: "raw-token",
        });
    });
});
