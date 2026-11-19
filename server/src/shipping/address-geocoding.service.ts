import { Inject, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { env } from "#src/config/env.config";

type GeocodingInput = { addressLine: string; city?: string; locale?: "en" | "vi" };
type ReverseGeocodingInput = { latitude: number; longitude: number; locale?: "en" | "vi" };
type GeocodingFeature = { properties?: Record<string, unknown>; geometry?: { coordinates?: unknown } };

@Injectable()
export class AddressGeocodingService {
    constructor(
        @Inject("GEOCODING_ENDPOINT") private readonly geocodingEndpoint: string = env.geocodingEndpoint,
        @Inject("GEOAPIFY_API_KEY") private readonly geoapifyApiKey: string = env.geoapifyApiKey,
    ) {}
    private lastRequestAt = 0;
    private requestQueue: Promise<void> = Promise.resolve();

    private async waitForProviderSlot() {
        const previous = this.requestQueue;
        let unlock!: () => void;
        this.requestQueue = new Promise<void>((resolve) => { unlock = resolve; });
        await previous;
        try {
            const delay = Math.max(0, 1000 - (Date.now() - this.lastRequestAt));
            if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
            this.lastRequestAt = Date.now();
        } finally {
            unlock();
        }
    }

    async find(input: GeocodingInput) {
        if (!this.geocodingEndpoint) throw new ServiceUnavailableException("Address lookup is not configured");
        const url = new URL(this.geocodingEndpoint);
        if (url.protocol !== "https:") throw new ServiceUnavailableException("Address lookup is not available");
        const isGeoapify = url.origin === "https://api.geoapify.com" && url.pathname.replace(/\/+$/, "") === "/v1/geocode/search";
        const query = [input.addressLine, input.city, "Vietnam"].filter(Boolean).join(", ");
        if (isGeoapify) {
            if (!env.geoapifyApiKey) throw new ServiceUnavailableException("Address lookup is not configured");
            url.searchParams.set("text", query);
            url.searchParams.set("filter", "countrycode:vn");
            url.searchParams.set("format", "geojson");
            url.searchParams.set("apiKey", env.geoapifyApiKey);
        } else {
            url.searchParams.set("q", query);
        }
        url.searchParams.set("limit", "5");
        url.searchParams.set("lang", input.locale || "en");

        let payload: { features?: GeocodingFeature[] };
        try {
            await this.waitForProviderSlot();
            const response = await fetch(url, { signal: AbortSignal.timeout(4000), headers: { Accept: "application/json" } });
            if (!response.ok) throw new Error("Geocoder returned an error");
            payload = await response.json() as { features?: GeocodingFeature[] };
        } catch {
            throw new ServiceUnavailableException("Address lookup is temporarily unavailable");
        }

        return (Array.isArray(payload.features) ? payload.features : []).slice(0, 5).flatMap((feature) => {
            const coordinates = feature.geometry?.coordinates;
            const longitude = Number(Array.isArray(coordinates) ? coordinates[0] : NaN);
            const latitude = Number(Array.isArray(coordinates) ? coordinates[1] : NaN);
            if (!Number.isFinite(latitude) || latitude < 8 || latitude > 24 || !Number.isFinite(longitude) || longitude < 102 || longitude > 110) return [];
            const properties = feature.properties || {};
            const label = typeof properties.formatted === "string" && properties.formatted.trim()
                ? properties.formatted.trim()
                : [properties.name, properties.street, properties.district, properties.city || properties.locality, properties.state, properties.country]
                    .filter((part, index, values): part is string => typeof part === "string" && Boolean(part.trim()) && values.indexOf(part) === index)
                    .join(", ");
            const city = [properties.city, properties.locality].find((part): part is string => typeof part === "string" && Boolean(part.trim()));
            const state = typeof properties.state === "string" && properties.state.trim() ? properties.state : undefined;
            return label ? [{ label: label.slice(0, 240), city, state, latitude, longitude }] : [];
        });
    }

    async reverse(input: ReverseGeocodingInput) {
        if (!this.geocodingEndpoint || !this.geoapifyApiKey) throw new ServiceUnavailableException("Address lookup is not configured");
        if (input.latitude < 8 || input.latitude > 24 || input.longitude < 102 || input.longitude > 110) return null;

        const url = new URL(this.geocodingEndpoint);
        const isGeoapifySearchEndpoint = url.origin === "https://api.geoapify.com" && url.pathname.replace(/\/+$/, "") === "/v1/geocode/search";
        if (!isGeoapifySearchEndpoint || url.username || url.password || url.search || url.hash) {
            throw new ServiceUnavailableException("Reverse address lookup is not available");
        }
        url.pathname = "/v1/geocode/reverse";
        url.searchParams.set("lat", String(input.latitude));
        url.searchParams.set("lon", String(input.longitude));
        url.searchParams.set("format", "geojson");
        url.searchParams.set("limit", "1");
        url.searchParams.set("lang", input.locale || "en");
        url.searchParams.set("apiKey", this.geoapifyApiKey);

        let payload: { features?: GeocodingFeature[] };
        try {
            await this.waitForProviderSlot();
            const response = await fetch(url, { signal: AbortSignal.timeout(4000), headers: { Accept: "application/json" } });
            if (!response.ok) throw new Error("Geocoder returned an error");
            payload = await response.json() as { features?: GeocodingFeature[] };
        } catch {
            throw new ServiceUnavailableException("Address lookup is temporarily unavailable");
        }

        const feature = Array.isArray(payload.features) ? payload.features[0] : undefined;
        if (!feature) return null;

        const coordinates = feature.geometry?.coordinates;
        const longitude = Number(Array.isArray(coordinates) ? coordinates[0] : NaN);
        const latitude = Number(Array.isArray(coordinates) ? coordinates[1] : NaN);
        if (!Number.isFinite(latitude) || latitude < 8 || latitude > 24 || !Number.isFinite(longitude) || longitude < 102 || longitude > 110) return null;

        const properties = feature.properties || {};
        const countryCode = typeof properties.country_code === "string" ? properties.country_code.toLowerCase() : "";
        if (countryCode && countryCode !== "vn") return null;
        const label = typeof properties.formatted === "string" && properties.formatted.trim()
            ? properties.formatted.trim()
            : [properties.name, properties.street, properties.district, properties.city || properties.locality, properties.state, properties.country]
                .filter((part, index, values): part is string => typeof part === "string" && Boolean(part.trim()) && values.indexOf(part) === index)
                .join(", ");
        const city = [properties.city, properties.locality, properties.county].find((part): part is string => typeof part === "string" && Boolean(part.trim()));
        const state = typeof properties.state === "string" && properties.state.trim() ? properties.state : undefined;
        return label ? { label: label.slice(0, 240), city, state, latitude, longitude } : null;
    }
}
