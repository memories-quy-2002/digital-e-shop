import { beforeEach, describe, expect, it, vi } from "vitest";

const { cancelPaymentLink } = vi.hoisted(() => ({ cancelPaymentLink: vi.fn() }));
vi.mock("@payos/node", () => ({
    NotFoundError: class NotFoundError extends Error {},
    PayOS: vi.fn(function PayOS() {
        return { paymentRequests: { cancel: cancelPaymentLink } };
    }),
}));

import { PayOSService } from "../payos.service";

describe("PayOSService", () => {
    beforeEach(() => vi.clearAllMocks());

    it("bounds cancellation calls to the shared provider timeout without SDK retries", async () => {
        cancelPaymentLink.mockResolvedValue({ status: "CANCELLED" });
        const config = { get: (key: string) => ({
            payosClientId: "client", payosApiKey: "api", payosChecksumKey: "checksum", payosPartnerCode: "", payosBaseUrl: "",
        }[key]) };
        const service = new PayOSService(config as never);

        await expect(service.cancelPaymentLink("link-1", "customer request")).resolves.toEqual({ status: "CANCELLED" });
        expect(cancelPaymentLink).toHaveBeenCalledWith("link-1", "customer request", { timeout: 10_000, maxRetries: 0 });
    });
});
