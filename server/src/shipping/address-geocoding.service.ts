import { Inject, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { env } from "#src/config/env.config";

type GeocodingInput = { addressLine: string; city?: string; locale?: "en" | "vi" };
type PhotonFeature = { properties?: Record<string, unknown>; geometry?: { coordinates?: unknown } };

@Injectable()
export class AddressGeocodingService {
    constructor(@Inject("GEOCODING_ENDPOINT") private readonly geocodingEndpoint: string = env.geocodingEndpoint) {}
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
        url.searchParams.set("q", [input.addressLine, input.city, "Vietnam"].filter(Boolean).join(", "));
        url.searchParams.set("limit", "5");
        url.searchParams.set("lang", input.locale || "en");

        let payload: { features?: PhotonFeature[] };
        try {
            await this.waitForProviderSlot();
            const response = await fetch(url, { signal: AbortSignal.timeout(4000), headers: { Accept: "application/json" } });
            if (!response.ok) throw new Error("Geocoder returned an error");
            payload = await response.json() as { features?: PhotonFeature[] };
        } catch {
            throw new ServiceUnavailableException("Address lookup is temporarily unavailable");
        }

        return (Array.isArray(payload.features) ? payload.features : []).slice(0, 5).flatMap((feature) => {
            const coordinates = feature.geometry?.coordinates;
            const longitude = Number(Array.isArray(coordinates) ? coordinates[0] : NaN);
            const latitude = Number(Array.isArray(coordinates) ? coordinates[1] : NaN);
            if (!Number.isFinite(latitude) || latitude < 8 || latitude > 24 || !Number.isFinite(longitude) || longitude < 102 || longitude > 110) return [];
            const properties = feature.properties || {};
            const label = [properties.name, properties.street, properties.district, properties.city || properties.locality, properties.state, properties.country]
                .filter((part, index, values): part is string => typeof part === "string" && Boolean(part.trim()) && values.indexOf(part) === index)
                .join(", ");
            const city = [properties.city, properties.locality].find((part): part is string => typeof part === "string" && Boolean(part.trim()));
            const state = typeof properties.state === "string" && properties.state.trim() ? properties.state : undefined;
            return label ? [{ label: label.slice(0, 240), city, state, latitude, longitude }] : [];
        });
    }
}
