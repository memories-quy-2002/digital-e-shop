import { beforeEach, describe, expect, it, vi } from "vitest";
import http from "../../lib/http";
import { subscribeToMarketing, unsubscribeFromMarketing } from "./api";

vi.mock("../../lib/http", () => ({
    default: { post: vi.fn() },
}));

describe("marketing API", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(http.post).mockResolvedValue({ data: {} } as never);
    });

    it("subscribes an email from the footer", async () => {
        await subscribeToMarketing("buyer@example.com");

        expect(http.post).toHaveBeenCalledWith("/api/marketing/subscribe", {
            email: "buyer@example.com",
            source: "footer",
        });
    });

    it("unsubscribes using the opaque link token", async () => {
        await unsubscribeFromMarketing("unsubscribe-token");

        expect(http.post).toHaveBeenCalledWith("/api/marketing/unsubscribe", {
            token: "unsubscribe-token",
        });
    });
});
