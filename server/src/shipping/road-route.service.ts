import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import axios from "axios";
import { env } from "../config/env.config";
import { GEOAPIFY_ROUTING_ENDPOINT, isGeoapifyRoutingEndpoint, isRoutingEndpointAllowed } from "./delivery-routing.config";
import type { RoadPoint, RoadRoute } from "./shipping.types";

const ROUTE_UNAVAILABLE_MESSAGE = "Delivery route is unavailable. Please retry later.";

function isRoadPoint(value: RoadPoint): boolean {
    return Number.isFinite(value.latitude) && value.latitude >= -90 && value.latitude <= 90
        && Number.isFinite(value.longitude) && value.longitude >= -180 && value.longitude <= 180;
}

function parseGeoapifyRouteResponse(value: unknown): RoadRoute {
    if (!value || typeof value !== "object") throw new Error("Invalid route response");
    const response = value as { features?: Array<{ properties?: { distance?: unknown }; geometry?: { type?: unknown; coordinates?: unknown } }> };
    const route = Array.isArray(response.features) ? response.features[0] : undefined;
    const distance = route?.properties?.distance;
    if (typeof distance !== "number" || !Number.isFinite(distance) || distance < 0) throw new Error("Invalid route distance");

    const distanceMeters = Math.round(distance);
    if (!Number.isSafeInteger(distanceMeters)) throw new Error("Invalid route distance");
    const geometryValue = route?.geometry;
    const lines = geometryValue?.type === "LineString"
        ? [geometryValue.coordinates]
        : geometryValue?.type === "MultiLineString" && Array.isArray(geometryValue.coordinates)
            ? geometryValue.coordinates
            : null;
    if (!lines) throw new Error("Invalid route geometry");

    const geometry = lines.flatMap((line) => {
        if (!Array.isArray(line)) throw new Error("Invalid route geometry");
        return line.map((coordinate) => {
            if (!Array.isArray(coordinate) || coordinate.length < 2) throw new Error("Invalid route coordinate");
            const [longitude, latitude] = coordinate;
            if (typeof longitude !== "number" || typeof latitude !== "number"
                || !Number.isFinite(longitude) || !Number.isFinite(latitude)
                || longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) {
                throw new Error("Invalid route coordinate");
            }
            return [longitude, latitude] as [number, number];
        });
    });
    if (geometry.length < 2) throw new Error("Invalid route geometry");
    return { distanceMeters, geometry };
}

@Injectable()
export class RoadRouteService {
    async getRoute(origin: RoadPoint, destination: RoadPoint, endpoint: string): Promise<RoadRoute> {
        if (!isRoadPoint(origin) || !isRoadPoint(destination)
            || !isGeoapifyRoutingEndpoint(endpoint)
            || !isRoutingEndpointAllowed(endpoint, env.deliveryRoutingEndpointAllowlist)) {
            throw new ServiceUnavailableException(ROUTE_UNAVAILABLE_MESSAGE);
        }

        try {
            if (!env.geoapifyApiKey) throw new Error("Geoapify routing is not configured");
            const response = await axios.get<unknown>(GEOAPIFY_ROUTING_ENDPOINT, {
                params: {
                waypoints: `${origin.latitude},${origin.longitude}|${destination.latitude},${destination.longitude}`,
                mode: "drive",
                format: "geojson",
                apiKey: env.geoapifyApiKey,
                },
                timeout: 5000,
                maxRedirects: 0,
                headers: { "User-Agent": "Digital-E/1.0" },
            });
            return parseGeoapifyRouteResponse(response.data);
        } catch {
            throw new ServiceUnavailableException(ROUTE_UNAVAILABLE_MESSAGE);
        }
    }
}
