import { beforeEach, describe, expect, it, vi } from "vitest";
import http from "../../lib/http";
import { loginUser } from "./api";

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
});
