import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { withTransaction } from "../../database/transaction";
import { createTestProduct, integrationPool, cleanupTestData, closeIntegrationPools } from "../../database/__tests__/integration-database";
import { ShippingQuoteService } from "../shipping-quote.service";
import { ShippingQuoteRepository } from "../shipping-quote.repository";
import { DeliverySettingsRepository } from "../delivery-settings.repository";
import { DeliverySettingsService } from "../delivery-settings.service";
import { deliveryAddress } from "./checkout-fixture";

describe("delivery quote database integration", () => {
    const identity = { kind: "guest" as const, guestCartId: randomUUID() };
    const ids: string[] = [];
    const service = new ShippingQuoteService(
        new ShippingQuoteRepository(),
        new DeliverySettingsService(new DeliverySettingsRepository()),
        { getRoute: async () => ({ distanceMeters: 5000, geometry: [[106.7, 10.78], [106.7009, 10.7769]] }) } as never,
    );
    let productId: number;
    let previousSettings: Record<string, unknown> | null = null;
    const cart = () => [{ product_id: productId, product_name: "Test", price: 10, sale_price: null, quantity: 2 }];
    const create = async () => {
        const quote = await service.createQuote(identity, { address: deliveryAddress, cart: cart(), subtotal: 20, discount: 0 });
        ids.push(quote.id);
        return { shippingQuoteId: quote.id, deliveryAddress, quoteIdentity: identity };
    };
    beforeAll(async () => {
        if (process.env.DB_HOST !== "127.0.0.1" || process.env.DB_NAME !== "retail_p0_test") throw new Error("Requires local disposable retail_p0_test");
        productId = await createTestProduct("quote", 10);
        const [settingsRows] = await integrationPool.execute("SELECT * FROM delivery_settings WHERE id = 1");
        previousSettings = (settingsRows as Record<string, unknown>[])[0] ?? null;
        if (!previousSettings) throw new Error("Requires the internal delivery migration in retail_p0_test");
        await integrationPool.execute(
            `UPDATE delivery_settings
             SET store_address = 'Integration Store', store_latitude = 10.78, store_longitude = 106.7,
                 fee_5_to_20_vnd = 25000, fee_over_20_vnd = 50000,
                 routing_endpoint = 'https://router.example.test', tile_url = 'https://tiles.example.test/{z}/{x}/{y}.png',
                 tile_attribution = 'Map provider', version = 2, updated_by_id = NULL WHERE id = 1`,
        );
    });
    afterAll(async () => {
        for (const id of ids) await integrationPool.execute("DELETE FROM delivery_quotes WHERE id = ?", [id]);
        if (previousSettings) {
            await integrationPool.execute(
                `UPDATE delivery_settings
                 SET store_address = ?, store_latitude = ?, store_longitude = ?, fee_5_to_20_vnd = ?, fee_over_20_vnd = ?,
                     routing_endpoint = ?, tile_url = ?, tile_attribution = ?, version = ?, updated_by_id = ? WHERE id = 1`,
                [previousSettings.store_address, previousSettings.store_latitude, previousSettings.store_longitude,
                    previousSettings.fee_5_to_20_vnd, previousSettings.fee_over_20_vnd, previousSettings.routing_endpoint,
                    previousSettings.tile_url, previousSettings.tile_attribution, previousSettings.version, previousSettings.updated_by_id],
            );
        }
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
        expect(result.pricing.shippingFee).toBe(25000);
        expect(result.pricing.payableTotal).toBe(20 + result.pricing.shippingFee);
    });
    it("integration rejects expired and missing quotes", async () => {
        const checkout = await create();
        await integrationPool.execute("UPDATE delivery_quotes SET expires_at = '2000-01-01' WHERE id = ?", [checkout.shippingQuoteId]);
        await expect(withTransaction((tx) => service.validateQuote(tx, checkout, cart(), 20, 0))).rejects.toThrow();
        await expect(withTransaction((tx) => service.validateQuote(tx, { ...checkout, shippingQuoteId: randomUUID() }, cart(), 20, 0))).rejects.toThrow();
    });
});
