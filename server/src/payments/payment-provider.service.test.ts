import { describe, expect, it, vi } from "vitest";
import { PaymentProviderService } from "./payment-provider.service";

const config = (mode: "mock" | "live", rate = 25_000) => ({
    get: vi.fn((key: string) => ({
        paymentProviderMode: mode,
        payosUsdToVndRate: rate,
        stripeSecretKey: mode === "live" ? "" : "",
    })[key]),
});

describe("PaymentProviderService", () => {
    it("returns deterministic symbolic references in mock mode", async () => {
        const service = new PaymentProviderService(config("mock") as never, {} as never);

        await expect(service.createPayment({ provider: "payos", orderId: 12, amount: 250000, currency: "VND" }))
            .resolves.toMatchObject({ status: "pending", providerReference: "mock_payos_order_12", simulated: true });
    });

    it("does not simulate a successful refund when live Stripe credentials are absent", async () => {
        const service = new PaymentProviderService(config("live") as never, {} as never);

        await expect(service.refundPayment({ provider: "stripe", orderId: 12, paymentId: "pi_123", amount: 10, currency: "USD" }))
            .rejects.toThrow("Stripe payments are not configured");
    });

    it("does not claim to create a live PayOS payment without a PayOS integration", async () => {
        const service = new PaymentProviderService(config("live") as never, {} as never);

        await expect(service.createPayment({ provider: "payos", orderId: 12, amount: 250000, currency: "VND" }))
            .rejects.toThrow("PayOS payments are not configured");
    });
});
