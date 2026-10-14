import { describe, expect, it, vi } from "vitest";
import { GhnShippingProvider } from "../ghn.provider";
import { SandboxShippingProvider } from "../sandbox-shipping.provider";
import type { DeliveryAddress, ShippingParcel } from "../shipping.types";
import { ShippingProviderError } from "../shipping.policy";

const address: DeliveryAddress = {
    recipientName: "Nguyen Van A",
    recipientPhone: "0900000000",
    addressLine: "1 Nguyen Hue",
    provinceCode: "202",
    provinceName: "Ho Chi Minh City",
    wardCode: "20308",
    wardName: "Ben Nghe Ward",
    country: "VN",
    districtCode: "1444",
};

const parcel: ShippingParcel = { grams: 600, lengthCm: 25, widthCm: 20, heightCm: 8 };
const sandboxAddress: DeliveryAddress = {
    ...address,
    provinceCode: "1000001",
    provinceName: "Ho Chi Minh City",
    wardCode: "1003646",
    wardName: "Sandbox Ward One",
    districtCode: undefined,
};
const sender = {
    name: "Digital E",
    phone: "0900000001",
    addressLine: "39 Nguyen Thi Thap",
    provinceName: "Ho Chi Minh City",
    districtName: "District 7",
    districtCode: "1452",
    wardName: "Tan Phu Ward",
    wardCode: "21007",
};

const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const ghnProvider = (fetcher: typeof fetch, mode: "staging" | "production" = "staging") =>
    new GhnShippingProvider({ mode, token: "test-token", shopId: 92837, sender }, fetcher);

describe("shipping provider adapters", () => {
    it("quotes two-level addresses with the non-creating preview and shop-paid shipping", async () => {
        const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response({ code: 200, data: { order_code: "", total_fee: 20900, expected_delivery_time: "2026-10-17T10:00:00Z" } }));
        const provider = ghnProvider(fetcher);
        await expect(provider.quote({ ...address, districtCode: undefined }, parcel, { serviceTypeId: 2 })).resolves.toEqual({ feeVnd: 20900, expectedDeliveryAt: "2026-10-17T10:00:00.000Z" });
        expect(String(fetcher.mock.calls[0][0])).toContain("/shipping-order/preview");
        expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toMatchObject({ payment_type_id: 1, is_new_to_address: true, to_ward_name: address.wardName });
    });
    it("rejects incomplete address and parcel metadata before calling GHN", async () => {
        const fetcher = vi.fn<typeof fetch>();
        const provider = ghnProvider(fetcher);

        await expect(provider.quote({ ...address, provinceCode: "" }, parcel, { serviceTypeId: 2 })).rejects.toMatchObject({
            code: "INVALID_ADDRESS",
        });
        await expect(provider.quote(address, { ...parcel, widthCm: undefined }, { serviceTypeId: 2 })).rejects.toMatchObject({
            code: "INVALID_PARCEL",
        });
        expect(fetcher).not.toHaveBeenCalled();
    });

    it.each([0, -1, 1.5])("rejects non-positive integer dimensions (%s)", async (dimension) => {
        const provider = ghnProvider(vi.fn<typeof fetch>());
        await expect(provider.quote(address, { ...parcel, lengthCm: dimension }, { serviceTypeId: 2 })).rejects.toMatchObject({
            code: "INVALID_PARCEL",
        });
    });

    it("rejects an unavailable service and a malformed provider fee", async () => {
        const unavailable = ghnProvider(vi.fn<typeof fetch>().mockResolvedValueOnce(response({ code: 200, data: [] })));
        await expect(unavailable.quote(address, parcel, { serviceTypeId: 2 })).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });

        const malformed = ghnProvider(vi.fn<typeof fetch>()
            .mockResolvedValueOnce(response({ code: 200, data: [{ service_type_id: 2 }] }))
            .mockResolvedValueOnce(response({ code: 200, data: { total: "20,900" } })));
        await expect(malformed.quote(address, parcel, { serviceTypeId: 2 })).rejects.toMatchObject({ code: "INVALID_PROVIDER_RESPONSE" });
    });

    it("rejects malformed ward codes and unavailable local services", async () => {
        const provider = ghnProvider(vi.fn<typeof fetch>());
        await expect(provider.quote({ ...address, wardCode: "ward-west" }, parcel, { serviceTypeId: 2 })).rejects.toMatchObject({
            code: "INVALID_ADDRESS",
        });

        const sandbox = new SandboxShippingProvider({ nodeEnv: "test" });
        await expect(sandbox.quote(sandboxAddress, parcel, { serviceTypeId: 7 })).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
        await expect(sandbox.quote({ ...sandboxAddress, wardCode: "9999999" }, parcel, { serviceTypeId: 2 })).rejects.toMatchObject({
            code: "INVALID_ADDRESS",
        });
    });

    it("maps integer VND quote values and expected delivery time", async () => {
        const provider = ghnProvider(vi.fn<typeof fetch>()
            .mockResolvedValueOnce(response({ code: 200, data: [{ service_id: 53320, service_type_id: 2, short_name: "Standard" }] }))
            .mockResolvedValueOnce(response({ code: 200, data: { total: 20900 } })));

        await expect(provider.quote(address, parcel, { serviceTypeId: 2 })).resolves.toEqual({ feeVnd: 20900, expectedDeliveryAt: null });
    });

    it("uses the stable client reference to recover an ambiguously created order", async () => {
        const provider = ghnProvider(vi.fn<typeof fetch>().mockResolvedValueOnce(response({
            code: 200,
            data: { order_code: "LADFYR", client_order_code: "order-123", shop_id: 92837, status: "ready_to_pick", cod_amount: 45000 },
        })));

        const shipment = await provider.findByClientReference("order-123");
        expect(shipment).toMatchObject({ orderCode: "LADFYR", clientReference: "order-123", status: "READY_TO_SHIP", codAmountVnd: 45000 });
    });

    it("creates a shipment with the stable client reference and the documented two-level address fields", async () => {
        const fetcher = vi.fn<typeof fetch>()
            .mockResolvedValueOnce(response({ code: 200, data: [{ service_id: 53320, service_type_id: 2, short_name: "Standard" }] }))
            .mockResolvedValueOnce(response({
                code: 200,
                data: { order_code: "LADFYR", fee: { main_service: 20900 }, total_fee: 20900, expected_delivery_time: "2026-10-17T10:00:00Z" },
            }));
        const provider = ghnProvider(fetcher);

        const shipment = await provider.createShipment({
            clientReference: "order-123",
            address,
            parcel,
            service: { serviceTypeId: 2 },
            codAmountVnd: 45000,
            orderValueVnd: 45000,
        });

        expect(shipment).toMatchObject({ orderCode: "LADFYR", clientReference: "order-123", carrierFeeVnd: 20900 });
        const requestBody = JSON.parse(String(fetcher.mock.calls[1][1]?.body));
        expect(requestBody).toMatchObject({
            client_order_code: "order-123",
            is_new_to_address: true,
            to_province_name: address.provinceName,
            to_ward_name: address.wardName,
            cod_amount: 45000,
        });
        expect(requestBody).not.toHaveProperty("to_district_name");
    });

    it("rejects wrong-shop and unknown-status lookup results safely", async () => {
        const wrongShop = ghnProvider(vi.fn<typeof fetch>().mockResolvedValueOnce(response({
            code: 200,
            data: { order_code: "LADFYR", client_order_code: "order-123", shop_id: 44, status: "ready_to_pick", cod_amount: 0 },
        })));
        await expect(wrongShop.findByClientReference("order-123")).rejects.toMatchObject({ code: "SHOP_MISMATCH" });

        const unknownStatus = ghnProvider(vi.fn<typeof fetch>().mockResolvedValueOnce(response({
            code: 200,
            data: { order_code: "LADFYR", client_order_code: "order-123", shop_id: 92837, status: "future_state", cod_amount: 0 },
        })));
        await expect(unknownStatus.lookup("LADFYR")).resolves.toMatchObject({ status: "UNKNOWN" });
    });

    it("maps GHN ward validation errors without exposing provider messages", async () => {
        const provider = ghnProvider(vi.fn<typeof fetch>()
            .mockResolvedValueOnce(response({ code: 200, data: [{ service_id: 53320, service_type_id: 2, short_name: "Standard" }] }))
            .mockResolvedValueOnce(response({ code: 400, code_message: "WARD_IS_INVALID", message: "provider detail with account data" }, 400)));

        await expect(provider.quote(address, parcel, { serviceTypeId: 2 })).rejects.toMatchObject({ code: "INVALID_ADDRESS" });
        await expect(provider.quote(address, parcel, { serviceTypeId: 2 })).rejects.not.toThrow("account data");
    });

    it("returns only a short-lived label token, not a provider-controlled URL", async () => {
        const provider = ghnProvider(vi.fn<typeof fetch>().mockResolvedValueOnce(response({ code: 200, data: { token: "short-lived" } })));
        const label = await provider.getLabel("LADFYR");
        expect(label).toMatchObject({ token: "short-lived" });
        expect(label.expiresAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
        expect(label).not.toHaveProperty("url");
    });

    it("uses HTTPS allowlisted GHN endpoints and an eight-second timeout", async () => {
        let requestUrl = "";
        let requestInit: RequestInit | undefined;
        const fetcher: typeof fetch = vi.fn(async (input, init) => {
            requestUrl = String(input);
            requestInit = init;
            return response({ code: 200, data: [{ service_id: 53320, service_type_id: 2, short_name: "Standard" }] });
        });
        await ghnProvider(fetcher).getAvailableServices("1452", "1444");

        expect(requestUrl).toBe("https://dev-online-gateway.ghn.vn/shiip/public-api/v2/shipping-order/available-services");
        expect(requestInit?.signal).toBeInstanceOf(AbortSignal);
        expect(requestInit?.headers).toMatchObject({ Token: "test-token", ShopId: "92837" });
    });

    it("converts network timeouts into a safe provider error", async () => {
        const provider = ghnProvider(vi.fn<typeof fetch>().mockRejectedValue(new DOMException("secret endpoint details", "TimeoutError")));
        await expect(provider.getAvailableServices("1452", "1444")).rejects.toMatchObject({ code: "PROVIDER_TIMEOUT" });
        await expect(provider.getAvailableServices("1452", "1444")).rejects.not.toThrow("secret endpoint details");
    });

    it("rejects missing GHN credentials and unsafe endpoint overrides", () => {
        expect(() => new GhnShippingProvider({ mode: "production", token: " ", shopId: 1, sender })).toThrow(ShippingProviderError);
        expect(() => new GhnShippingProvider({ mode: "staging", token: "test-token", shopId: 1, sender, baseUrl: "http://127.0.0.1" })).toThrow(
            ShippingProviderError,
        );
    });

    it("provides deterministic sandbox shipments and refuses production", async () => {
        expect(() => new SandboxShippingProvider({ nodeEnv: "production" })).toThrow(ShippingProviderError);
        const provider = new SandboxShippingProvider({ nodeEnv: "test" });
        const first = await provider.createShipment({
            clientReference: "order-123",
            address: sandboxAddress,
            parcel,
            service: { serviceTypeId: 2 },
            codAmountVnd: 45000,
            orderValueVnd: 45000,
        });
        const replay = await provider.findByClientReference("order-123");

        expect(first).toMatchObject({ clientReference: "order-123", sandbox: true, codAmountVnd: 45000 });
        expect(replay).toEqual(first);
    });
});
