import { beforeEach, describe, expect, it, vi } from "vitest";
import http from "../../lib/http";
import {
    assignDeliveryOrder,
    fetchAdminDeliverySettings,
    fetchAssignableDeliveryOrders,
    fetchCustomerShipment,
    fetchDeliveryAssignmentHistory,
    fetchDeliveryMapConfig,
    fetchDeliveryStaff,
    fetchDeliveryStaffAssignments,
    fetchGuestShipment,
    requestInternalDeliveryQuote,
    updateAdminDeliverySettings,
    updateDeliveryStaffAssignment,
} from "./api";

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

    it("uses only the scoped routes for internal delivery", async () => {
        const settings = { storeAddress: "Store", storeLatitude: 10.78, storeLongitude: 106.7, fee5To20Vnd: 25000, feeOver20Vnd: 50000, routingEndpoint: "https://router.example.test/route/v1/driving", tileUrl: "https://tiles.example.test/{z}/{x}/{y}.png", tileAttribution: "Map contributors", version: 1 };
        vi.mocked(http.get).mockResolvedValueOnce({ data: { settings, allowedRoutingEndpoints: [settings.routingEndpoint], allowedTileUrls: [settings.tileUrl] } } as never);
        await expect(fetchAdminDeliverySettings()).resolves.toMatchObject({ settings, allowedRoutingEndpoints: [settings.routingEndpoint] });
        expect(http.get).toHaveBeenCalledWith("/api/admin/delivery/settings");

        vi.mocked(http.put).mockResolvedValueOnce({ data: { settings } } as never);
        await updateAdminDeliverySettings(settings);
        expect(http.put).toHaveBeenCalledWith("/api/admin/delivery/settings", settings);

        vi.mocked(http.get).mockResolvedValueOnce({ data: { orders: [{ orderId: 44 }] } } as never);
        await expect(fetchAssignableDeliveryOrders()).resolves.toEqual([{ orderId: 44 }]);
        vi.mocked(http.get).mockResolvedValueOnce({ data: { staff: [{ id: "staff-1", name: "Staff" }] } } as never);
        await expect(fetchDeliveryStaff()).resolves.toEqual([{ id: "staff-1", name: "Staff" }]);
        vi.mocked(http.get).mockResolvedValueOnce({ data: { assignments: [] } } as never);
        await expect(fetchDeliveryAssignmentHistory(44)).resolves.toEqual([]);
        expect(http.get).toHaveBeenLastCalledWith("/api/admin/delivery/orders/44");

        vi.mocked(http.post).mockResolvedValueOnce({ data: { id: 1 } } as never);
        await assignDeliveryOrder(44, { employeeId: "staff-1", scheduledStartAt: "2026-10-20T10:00", scheduledEndAt: "2026-10-20T12:00" });
        expect(http.post).toHaveBeenLastCalledWith("/api/admin/delivery/orders/44/assignments", expect.objectContaining({ employeeId: "staff-1" }));

        vi.mocked(http.get).mockResolvedValueOnce({ data: { assignments: [{ id: 1 }] } } as never);
        await expect(fetchDeliveryStaffAssignments()).resolves.toEqual([{ id: 1 }]);
        vi.mocked(http.post).mockResolvedValueOnce({ data: { id: 1, status: "DELIVERED" } } as never);
        await updateDeliveryStaffAssignment(1, { status: "DELIVERED" });
        expect(http.post).toHaveBeenLastCalledWith("/api/delivery/staff/assignments/1/status", { status: "DELIVERED" });
    });
});
