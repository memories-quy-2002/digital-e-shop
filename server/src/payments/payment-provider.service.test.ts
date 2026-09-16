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

    it("rejects legacy providers before a payment is created", async () => {
        const service = new PaymentProviderService(config("mock") as never, {} as never);

        await expect(service.createPayment({ provider: "stripe", orderId: 12, amount: 10, currency: "USD" } as never))
            .rejects.toThrow("Unsupported payment method");
        await expect(service.createPayment({ provider: "card", orderId: 12, amount: 10, currency: "USD" } as never))
            .rejects.toThrow("Unsupported payment method");
        await expect(service.createPayment({ provider: "bank_transfer", orderId: 12, amount: 10, currency: "USD" } as never))
            .rejects.toThrow("Unsupported payment method");
    });

    it("does not claim to create a live PayOS payment without a PayOS integration", async () => {
        const service = new PaymentProviderService(config("live") as never, {} as never);

        await expect(service.createPayment({ provider: "payos", orderId: 12, amount: 250000, currency: "VND" }))
            .rejects.toThrow("PayOS payments are not configured");
    });
});
