import { beforeEach, describe, expect, it, vi } from "vitest";
import http from "../../lib/http";
import { fetchCustomerShipment, fetchDeliveryMapConfig, fetchGuestShipment, requestInternalDeliveryQuote, saveProductParcel } from "./api";

vi.mock("../../lib/http", () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn() } }));

describe("shipping API", () => {
    beforeEach(() => vi.clearAllMocks());

    it("uses anonymous cookie-backed routes and sends the guest token only in the shipment request body", async () => {
        vi.mocked(http.post).mockResolvedValue({ data: { shipment: { orderId: 7 } } } as never);
        await expect(fetchGuestShipment(7, "private-token")).resolves.toEqual({ orderId: 7 });
        expect(http.post).toHaveBeenCalledWith("/api/shipping/guest/shipment", { orderId: 7, guestOrderToken: "private-token" });
        vi.mocked(http.post).mockResolvedValue({ data: { shipment: null } } as never);
        await expect(fetchGuestShipment(7, "private-token")).resolves.toBeNull();
        vi.mocked(http.get).mockResolvedValue({ data: { shipment: null } } as never);
        await expect(fetchCustomerShipment(7)).resolves.toBeNull();
    });

    it("loads public map configuration and requests an internal guest route quote", async () => {
        const map = { origin: { latitude: 10.78, longitude: 106.7 }, tileUrl: "https://tiles.example.test/{z}/{x}/{y}.png", tileAttribution: "Map contributors", storeAddress: "Store" };
        vi.mocked(http.get).mockResolvedValue({ data: { map } } as never);
        await expect(fetchDeliveryMapConfig()).resolves.toEqual(map);
        expect(http.get).toHaveBeenCalledWith("/api/shipping/delivery/map-config");
        vi.mocked(http.post).mockResolvedValue({ data: { id: "quote-1" } } as never);
        await requestInternalDeliveryQuote({ address: { recipientName: "A", recipientPhone: "1234567", addressLine: "Street", city: "HCMC", country: "VN", latitude: 10.78, longitude: 106.7 }, locale: "vi", cart: [{ productId: 2, quantity: 1 }] }, true);
        expect(http.post).toHaveBeenCalledWith("/api/shipping/guest/quotes", expect.objectContaining({ locale: "vi", cart: [{ productId: 2, quantity: 1 }] }));
    });

    it("persists validated product parcel metadata through shipping admin API", async () => {
        vi.mocked(http.put).mockResolvedValue({ data: { parcel: { grams: 400, lengthCm: 10, widthCm: 10, heightCm: 10 } } } as never);
        await expect(saveProductParcel(11, { grams: 400, lengthCm: 10, widthCm: 10, heightCm: 10 })).resolves.toMatchObject({ grams: 400 });
        expect(http.put).toHaveBeenCalledWith("/api/shipping/admin/products/11/parcel", { grams: 400, lengthCm: 10, widthCm: 10, heightCm: 10 });
    });
});
