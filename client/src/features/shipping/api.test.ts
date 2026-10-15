import { beforeEach, describe, expect, it, vi } from "vitest";
import http from "../../lib/http";
import { fetchCustomerShipment, fetchGuestShipment, fetchShippingServices, fetchShippingWards, requestShippingQuote, saveProductParcel } from "./api";

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

    it("encodes location codes and requests a guest quote without authenticated routes", async () => {
        vi.mocked(http.get).mockResolvedValue({ data: [] } as never);
        await fetchShippingWards("100/unsafe");
        expect(http.get).toHaveBeenCalledWith("/api/shipping/provinces/100%2Funsafe/wards");
        vi.mocked(http.post).mockResolvedValue({ data: { id: "quote-1" } } as never);
        await requestShippingQuote({ address: { recipientName: "A", recipientPhone: "1234567", addressLine: "Street", provinceCode: "1", provinceName: "P", wardCode: "2", wardName: "W", districtCode: "3", country: "VN" }, locale: "vi", cart: [{ productId: 2, quantity: 1 }] }, true);
        expect(http.post).toHaveBeenCalledWith("/api/shipping/guest/quotes", expect.objectContaining({ locale: "vi", cart: [{ productId: 2, quantity: 1 }] }));
        await fetchShippingServices();
        expect(http.get).toHaveBeenLastCalledWith("/api/shipping/services");
    });

    it("persists validated product parcel metadata through shipping admin API", async () => {
        vi.mocked(http.put).mockResolvedValue({ data: { parcel: { grams: 400, lengthCm: 10, widthCm: 10, heightCm: 10 } } } as never);
        await expect(saveProductParcel(11, { grams: 400, lengthCm: 10, widthCm: 10, heightCm: 10 })).resolves.toMatchObject({ grams: 400 });
        expect(http.put).toHaveBeenCalledWith("/api/shipping/admin/products/11/parcel", { grams: 400, lengthCm: 10, widthCm: 10, heightCm: 10 });
    });
});
