import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { withTransaction } from "../../database/transaction";
import { createTestProduct, integrationPool, cleanupTestData, closeIntegrationPools } from "../../database/__tests__/integration-database";
import { ShippingQuoteService } from "../shipping-quote.service";
import { ShippingQuoteRepository } from "../shipping-quote.repository";
import { SandboxShippingProvider } from "../sandbox-shipping.provider";
import { deliveryAddress } from "./checkout-fixture";

describe("delivery quote database integration", () => {
    const identity = { kind: "guest" as const, guestCartId: randomUUID() };
    const ids: string[] = [];
    const service = new ShippingQuoteService(new ShippingQuoteRepository(), { get: () => new SandboxShippingProvider({ nodeEnv: "test" }) } as never);
    let productId: number;
    const cart = () => [{ product_id: productId, product_name: "Test", price: 10, sale_price: null, quantity: 2 }];
    const create = async () => {
        const quote = await service.createQuote(identity, { address: deliveryAddress, cart: cart(), subtotal: 20, discount: 0 });
        ids.push(quote.id);
        return { shippingQuoteId: quote.id, deliveryAddress, quoteIdentity: identity };
    };
    beforeAll(async () => {
        if (process.env.DB_HOST !== "127.0.0.1" || process.env.DB_NAME !== "retail_p0_test") throw new Error("Requires local disposable retail_p0_test");
        productId = await createTestProduct("quote", 10);
        await integrationPool.execute("UPDATE products SET parcel_grams = 100, parcel_length_cm = 10, parcel_width_cm = 5, parcel_height_cm = 2 WHERE id = ?", [productId]);
    });
    afterAll(async () => {
        for (const id of ids) await integrationPool.execute("DELETE FROM delivery_quotes WHERE id = ?", [id]);
        await cleanupTestData();
        await closeIntegrationPools();
    });
    it("integration consumes a quote once under real concurrent transactions", async () => {
        const checkout = await create();
        const outcomes = await Promise.allSettled([1, 2].map(() => withTransaction((tx) => service.validateQuote(tx, checkout, cart(), 20, 0))));
        expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
        expect(outcomes.filter((outcome) => outcome.status === "rejected")).toHaveLength(1);
    });
    it("integration preserves a quote after business rollback and rejects changed identity, address and price", async () => {
        const checkout = await create();
        await expect(withTransaction(async (tx) => {
            await service.validateQuote(tx, checkout, cart(), 20, 0);
            throw new Error("Business rollback");
        })).rejects.toThrow("Business rollback");
        await expect(withTransaction((tx) => service.validateQuote(tx, { ...checkout, quoteIdentity: { kind: "authenticated", userId: identity.guestCartId } }, cart(), 20, 0))).rejects.toThrow();
        await expect(withTransaction((tx) => service.validateQuote(tx, { ...checkout, deliveryAddress: { ...deliveryAddress, addressLine: "Changed" } }, cart(), 20, 0))).rejects.toThrow();
        await expect(withTransaction((tx) => service.validateQuote(tx, checkout, cart(), 22, 0))).rejects.toThrow();
        const result = await withTransaction((tx) => service.validateQuote(tx, checkout, cart(), 20, 0));
        expect(result.pricing.shippingFee).toBeGreaterThan(0);
        expect(result.pricing.payableTotal).toBe(20 + result.pricing.shippingFee);
    });
    it("integration rejects expired and missing quotes", async () => {
        const checkout = await create();
        await integrationPool.execute("UPDATE delivery_quotes SET expires_at = '2000-01-01' WHERE id = ?", [checkout.shippingQuoteId]);
        await expect(withTransaction((tx) => service.validateQuote(tx, checkout, cart(), 20, 0))).rejects.toThrow();
        await expect(withTransaction((tx) => service.validateQuote(tx, { ...checkout, shippingQuoteId: randomUUID() }, cart(), 20, 0))).rejects.toThrow();
    });
});
