import { beforeEach, describe, expect, it, vi } from "vitest";
import http from "../../lib/http";
import {
    loginUser,
    registerUser,
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

    it("sends the Firebase ID token to the login endpoint", async () => {
        await loginUser({ idToken: "firebase-id-token" }, false);

        expect(http.post).toHaveBeenCalledWith("/api/users/login", {
            idToken: "firebase-id-token",
            rememberMe: false,
        });
    });

    it("sends the Firebase ID token and username to the registration endpoint", async () => {
        await registerUser({
            idToken: "firebase-id-token",
            user: { username: "demo-customer" },
        });

        expect(http.post).toHaveBeenCalledWith("/api/users/register", {
            idToken: "firebase-id-token",
            user: { username: "demo-customer" },
        });
    });
});
