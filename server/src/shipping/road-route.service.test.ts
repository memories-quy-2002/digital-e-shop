import axios from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { calculateDeliveryFee } from "./delivery.policy";
import { RoadRouteService } from "./road-route.service";

const { allowedEndpoints } = vi.hoisted(() => ({
    allowedEndpoints: ["https://router.example.test", "http://10.20.0.5:5000"],
}));

vi.mock("axios", () => ({ default: { get: vi.fn() } }));
vi.mock("../config/env.config", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../config/env.config")>();
    return { ...actual, env: { ...actual.env, deliveryRoutingEndpointAllowlist: allowedEndpoints } };
});

const routeResponse = (distance = 4999.5) => ({
    data: {
        code: "Ok",
        routes: [{ distance, geometry: { type: "LineString", coordinates: [[106.7, 10.7], [106.8, 10.8]] } }],
    },
});

describe("RoadRouteService", () => {
    const service = new RoadRouteService();
    const origin = { latitude: 10.7, longitude: 106.7 };
    const destination = { latitude: 10.8, longitude: 106.8 };
    const get = vi.mocked(axios.get);

    beforeEach(() => vi.clearAllMocks());

    it("requests an OSRM driving route and rounds provider meters before pricing", async () => {
        get.mockResolvedValueOnce(routeResponse() as never);

        const route = await service.getRoute(origin, destination, "https://router.example.test");

        expect(route).toEqual({
            distanceMeters: 5000,
            geometry: [[106.7, 10.7], [106.8, 10.8]],
        });
        expect(calculateDeliveryFee(route.distanceMeters, { fee5To20Vnd: 25000, feeOver20Vnd: 50000 })).toBe(25000);
        expect(get).toHaveBeenCalledWith(
            "https://router.example.test/route/v1/driving/106.7,10.7;106.8,10.8?overview=full&geometries=geojson&steps=false",
            { timeout: 5000, maxRedirects: 0, headers: { "User-Agent": "Digital-E/1.0" } },
        );
    });

    it.each([
        ["NoRoute", []],
        ["Ok", [{ distance: Number.NaN, geometry: { type: "LineString", coordinates: [[106.7, 10.7], [106.8, 10.8]] } }]],
        ["Ok", [{ distance: 1000, geometry: { type: "Point", coordinates: [106.7, 10.7] } }]],
        ["Ok", [{ distance: 1000, geometry: { type: "LineString", coordinates: [[200, 10], [106.8, 10.8]] } }]],
    ])("rejects missing or malformed route data", async (code, routes) => {
        get.mockResolvedValueOnce({ data: { code, routes } } as never);

        await expect(service.getRoute(origin, destination, "https://router.example.test"))
            .rejects.toThrow("Delivery route is unavailable");
    });

    it("turns routing timeouts into a recoverable route error", async () => {
        get.mockRejectedValueOnce(new Error("timeout"));

        await expect(service.getRoute(origin, destination, "https://router.example.test"))
            .rejects.toThrow("Delivery route is unavailable");
    });

    it("refuses an endpoint outside the deployment allowlist without making a request", async () => {
        await expect(service.getRoute(origin, destination, "https://attacker.example.test"))
            .rejects.toThrow("Delivery route is unavailable");
        expect(get).not.toHaveBeenCalled();
    });

    it("allows a private self-hosted route only at its exact configured endpoint", async () => {
        get.mockResolvedValueOnce(routeResponse(4000) as never);

        await expect(service.getRoute(origin, destination, "http://10.20.0.5:5000"))
            .resolves.toMatchObject({ distanceMeters: 4000 });
        await expect(service.getRoute(origin, destination, "http://10.20.0.5:5001"))
            .rejects.toThrow("Delivery route is unavailable");
        expect(get).toHaveBeenCalledTimes(1);
    });

    it("does not follow routing endpoint redirects", async () => {
        get.mockRejectedValueOnce(Object.assign(new Error("redirect"), { response: { status: 302 } }));

        await expect(service.getRoute(origin, destination, "https://router.example.test"))
            .rejects.toThrow("Delivery route is unavailable");
        expect(get).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ maxRedirects: 0 }));
    });

    it("validates input coordinates before making a request", async () => {
        await expect(service.getRoute({ ...origin, latitude: 91 }, destination, "https://router.example.test"))
            .rejects.toThrow("Delivery route is unavailable");
        expect(get).not.toHaveBeenCalled();
    });
});
