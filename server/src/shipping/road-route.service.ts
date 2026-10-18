import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import axios from "axios";
import { env } from "../config/env.config";
import { isRoutingEndpointAllowed, normalizeRoutingEndpoint } from "./delivery-routing.config";
import type { RoadPoint, RoadRoute } from "./shipping.types";

const ROUTE_UNAVAILABLE_MESSAGE = "Delivery route is unavailable. Please retry later.";

function isRoadPoint(value: RoadPoint): boolean {
    return Number.isFinite(value.latitude) && value.latitude >= -90 && value.latitude <= 90
        && Number.isFinite(value.longitude) && value.longitude >= -180 && value.longitude <= 180;
}

function parseRouteResponse(value: unknown): RoadRoute {
    if (!value || typeof value !== "object") throw new Error("Invalid route response");
    const response = value as {
        code?: unknown;
        routes?: Array<{ distance?: unknown; geometry?: { type?: unknown; coordinates?: unknown[] } }>;
    };
    const route = response.code === "Ok" && Array.isArray(response.routes) ? response.routes[0] : undefined;
    if (!route || typeof route.distance !== "number" || !Number.isFinite(route.distance) || route.distance < 0) {
        throw new Error("Invalid route distance");
    }

    const distanceMeters = Math.round(route.distance);
    if (!Number.isSafeInteger(distanceMeters) || route.geometry?.type !== "LineString" || !Array.isArray(route.geometry.coordinates)) {
        throw new Error("Invalid route geometry");
    }

    const geometry = route.geometry.coordinates.map((coordinate) => {
        if (!Array.isArray(coordinate) || coordinate.length < 2) throw new Error("Invalid route coordinate");
        const [longitude, latitude] = coordinate;
        if (typeof longitude !== "number" || typeof latitude !== "number"
            || !Number.isFinite(longitude) || !Number.isFinite(latitude)
            || longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) {
            throw new Error("Invalid route coordinate");
        }
        return [longitude, latitude] as [number, number];
    });

    if (geometry.length < 2) throw new Error("Invalid route geometry");
    return { distanceMeters, geometry };
}

@Injectable()
export class RoadRouteService {
    async getRoute(origin: RoadPoint, destination: RoadPoint, endpoint: string): Promise<RoadRoute> {
        const normalizedEndpoint = normalizeRoutingEndpoint(endpoint);
        if (!isRoadPoint(origin) || !isRoadPoint(destination)
            || !normalizedEndpoint
            || !isRoutingEndpointAllowed(endpoint, env.deliveryRoutingEndpointAllowlist)) {
            throw new ServiceUnavailableException(ROUTE_UNAVAILABLE_MESSAGE);
        }

        const coordinates = `${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}`;
        const url = `${normalizedEndpoint}/route/v1/driving/${coordinates}?overview=full&geometries=geojson&steps=false`;

        try {
            const response = await axios.get<unknown>(url, {
                timeout: 5000,
                maxRedirects: 0,
                headers: { "User-Agent": "Digital-E/1.0" },
            });
            return parseRouteResponse(response.data);
        } catch {
            throw new ServiceUnavailableException(ROUTE_UNAVAILABLE_MESSAGE);
        }
    }
}
