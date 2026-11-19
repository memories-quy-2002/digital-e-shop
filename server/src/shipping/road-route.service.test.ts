import axios from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { calculateDeliveryFee } from "./delivery.policy";
import { GEOAPIFY_ROUTING_ENDPOINT } from "./delivery-routing.config";
import { RoadRouteService } from "./road-route.service";

const { allowedEndpoints } = vi.hoisted(() => ({
    allowedEndpoints: ["https://api.geoapify.com/v1/routing"],
}));

vi.mock("axios", () => ({ default: { get: vi.fn() } }));
vi.mock("../config/env.config", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../config/env.config")>();
    return { ...actual, env: { ...actual.env, geoapifyApiKey: "server-test-key", deliveryRoutingEndpointAllowlist: allowedEndpoints } };
});

const routeResponse = (distance = 4999.5) => ({
    data: {
        type: "FeatureCollection",
        features: [{
            properties: { distance },
            geometry: { type: "LineString", coordinates: [[106.7, 10.7], [106.8, 10.8]] },
        }],
    },
});

describe("RoadRouteService", () => {
    const service = new RoadRouteService();
    const origin = { latitude: 10.7, longitude: 106.7 };
    const destination = { latitude: 10.8, longitude: 106.8 };
    const get = vi.mocked(axios.get);

    beforeEach(() => vi.clearAllMocks());

    it("requests a Geoapify driving route and rounds provider meters before pricing", async () => {
        get.mockResolvedValueOnce(routeResponse() as never);

        const route = await service.getRoute(origin, destination, GEOAPIFY_ROUTING_ENDPOINT);

        expect(route).toEqual({
            distanceMeters: 5000,
            geometry: [[106.7, 10.7], [106.8, 10.8]],
        });
        expect(calculateDeliveryFee(route.distanceMeters, { fee5To20Vnd: 25000, feeOver20Vnd: 50000 })).toBe(25000);
        expect(get).toHaveBeenCalledWith(GEOAPIFY_ROUTING_ENDPOINT, {
            params: {
                waypoints: "10.7,106.7|10.8,106.8",
                mode: "drive",
                format: "geojson",
                apiKey: "server-test-key",
            },
            timeout: 5000,
            maxRedirects: 0,
            headers: { "User-Agent": "Digital-E/1.0" },
        });
    });

    it("flattens Geoapify MultiLineString route geometry", async () => {
        get.mockResolvedValueOnce({
            data: {
                features: [{
                    properties: { distance: 1200 },
                    geometry: { type: "MultiLineString", coordinates: [[[106.7, 10.7], [106.75, 10.75]], [[106.75, 10.75], [106.8, 10.8]]] },
                }],
            },
        } as never);

        await expect(service.getRoute(origin, destination, GEOAPIFY_ROUTING_ENDPOINT)).resolves.toEqual({
            distanceMeters: 1200,
            geometry: [[106.7, 10.7], [106.75, 10.75], [106.75, 10.75], [106.8, 10.8]],
        });
    });

    it.each([
        { features: [] },
        { features: [{ properties: { distance: Number.NaN }, geometry: { type: "LineString", coordinates: [[106.7, 10.7], [106.8, 10.8]] } }] },
        { features: [{ properties: { distance: 1000 }, geometry: { type: "Point", coordinates: [106.7, 10.7] } }] },
        { features: [{ properties: { distance: 1000 }, geometry: { type: "LineString", coordinates: [[200, 10], [106.8, 10.8]] } }] },
    ])("rejects missing or malformed Geoapify route data", async (data) => {
        get.mockResolvedValueOnce({ data } as never);

        await expect(service.getRoute(origin, destination, GEOAPIFY_ROUTING_ENDPOINT))
            .rejects.toThrow("Delivery route is unavailable");
    });

    it("turns routing timeouts into a recoverable route error", async () => {
        get.mockRejectedValueOnce(new Error("timeout"));

        await expect(service.getRoute(origin, destination, GEOAPIFY_ROUTING_ENDPOINT))
            .rejects.toThrow("Delivery route is unavailable");
    });

    it.each(["https://attacker.example.test", "https://router.project-osrm.org", "http://10.20.0.5:5000"])(
        "refuses non-Geoapify route endpoint %s without making a request",
        async (endpoint) => {
            await expect(service.getRoute(origin, destination, endpoint))
                .rejects.toThrow("Delivery route is unavailable");
            expect(get).not.toHaveBeenCalled();
        },
    );

    it("does not follow routing endpoint redirects", async () => {
        get.mockRejectedValueOnce(Object.assign(new Error("redirect"), { response: { status: 302 } }));

        await expect(service.getRoute(origin, destination, GEOAPIFY_ROUTING_ENDPOINT))
            .rejects.toThrow("Delivery route is unavailable");
        expect(get).toHaveBeenCalledWith(GEOAPIFY_ROUTING_ENDPOINT, expect.objectContaining({ maxRedirects: 0 }));
    });

    it("validates input coordinates before making a request", async () => {
        await expect(service.getRoute({ ...origin, latitude: 91 }, destination, GEOAPIFY_ROUTING_ENDPOINT))
            .rejects.toThrow("Delivery route is unavailable");
        expect(get).not.toHaveBeenCalled();
    });
});
