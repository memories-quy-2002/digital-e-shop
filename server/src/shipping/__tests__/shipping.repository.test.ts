import { describe, expect, it, vi } from "vitest";
import { ShippingRepository, type ShipmentRow } from "../shipping.repository";

const legacyShipment: ShipmentRow = {
    id: 17, order_id: 42, state: "SHIPPED", provider: "GHN", client_reference: "legacy-order-42",
    provider_order_code: "GHN-42", expected_cod_vnd: 100_000, actual_fee_vnd: 15_000,
    expected_delivery_at: null, delivered_at: null, provider_updated_at: null,
    stock_received_at: null, sandbox: 0,
};

describe("ShippingRepository historical compatibility", () => {
    it("returns an existing GHN shipment unchanged without creating a second internal record", async () => {
        const repository = new ShippingRepository();
        vi.spyOn(repository, "lockShipment").mockResolvedValue(legacyShipment);
        const tx = { query: vi.fn() };

        await expect(repository.ensureShipment(tx as never, {
            id: 42, status: 0, currency: "VND", total_price: 100_000, discount: 0, user_id: "user-1",
            guest_email: null, guest_name: null, email: "buyer@example.com", delivery_snapshot: { provider: "INTERNAL" }, pricing_snapshot: null,
        })).resolves.toBe(legacyShipment);
        expect(tx.query).not.toHaveBeenCalled();
    });

    it("keeps stored provider events visible in the read-only shipment timeline", async () => {
        const repository = new ShippingRepository();
        vi.spyOn(repository, "lockShipment").mockResolvedValue(legacyShipment);
        const providerEvent = { id: 88, state: "SHIPPED", public_note: "Collected by GHN", created_at: new Date("2026-10-01T10:00:00Z") };
        const tx = { query: vi.fn().mockResolvedValue([providerEvent]) };

        await expect(repository.summary(tx as never, 42)).resolves.toMatchObject({
            provider: "GHN", trackingCode: "GHN-42", timeline: [providerEvent],
        });
        expect(tx.query.mock.calls[0][0]).not.toContain("provider_event_key IS NULL");
    });

    it("creates new internal shipments without carrier tracking fields", async () => {
        const repository = new ShippingRepository();
        const internalShipment = { ...legacyShipment, provider: "INTERNAL", state: "UNFULFILLED", provider_order_code: null } as ShipmentRow;
        vi.spyOn(repository, "lockShipment").mockResolvedValueOnce(null).mockResolvedValueOnce(internalShipment);
        const tx = { query: vi.fn(async (sql: string) => sql.includes("SELECT provider FROM order_payments") ? [{ provider: "cash" }] : []) };

        await repository.ensureShipment(tx as never, {
            id: 42, status: 0, currency: "VND", total_price: 100_000, discount: 0, user_id: "user-1",
            guest_email: null, guest_name: null, email: "buyer@example.com", delivery_snapshot: { provider: "INTERNAL" }, pricing_snapshot: null,
        });

        const shipmentInsert = tx.query.mock.calls.find(([sql]) => sql.startsWith("INSERT INTO shipments"))?.[0];
        expect(shipmentInsert).toContain("provider, client_reference");
        expect(shipmentInsert).not.toContain("provider_order_code");
    });
});
