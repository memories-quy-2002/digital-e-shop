import { z } from "zod";
import { normalizeRoutingEndpoint } from "./delivery-routing.config";

const latitudeSchema = z.number().finite().min(-90).max(90);
const longitudeSchema = z.number().finite().min(-180).max(180);
const moneySchema = z.number().int().safe().nonnegative();

export function normalizeTileUrl(url: string): string | null {
    if (!url.includes("{z}") || !url.includes("{x}") || !url.includes("{y}")) return null;
    try {
        const parsed = new URL(url.replaceAll("{z}", "0").replaceAll("{x}", "0").replaceAll("{y}", "0"));
        return parsed.protocol === "https:" && !parsed.username && !parsed.password
            && !parsed.search && !parsed.hash ? url : null;
    } catch {
        return null;
    }
}

export function isOpenStreetMapTileUrl(url: string): boolean {
    try {
        const normalizedUrl = normalizeTileUrl(url);
        const parsed = new URL(normalizedUrl?.replaceAll("{z}", "0").replaceAll("{x}", "0").replaceAll("{y}", "0") || "");
        return parsed.hostname === "tile.openstreetmap.org" && parsed.pathname === "/0/0/0.png";
    } catch {
        return false;
    }
}

export function isSafeTileUrl(url: string): boolean {
    return normalizeTileUrl(url) !== null;
}

export const deliverySettingsSchema = z.object({
    storeAddress: z.string().trim().min(1).max(255),
    storeLatitude: latitudeSchema,
    storeLongitude: longitudeSchema,
    fee5To20Vnd: moneySchema,
    feeOver20Vnd: moneySchema,
    routingEndpoint: z.string().trim().min(1).max(2048).refine((value) => normalizeRoutingEndpoint(value) !== null),
    tileUrl: z.string().trim().min(1).max(2048).refine(isSafeTileUrl),
    tileAttribution: z.string().trim().min(1).max(512),
}).superRefine((settings, context) => {
    if (!isOpenStreetMapTileUrl(settings.tileUrl)) {
        context.addIssue({ code: "custom", path: ["tileUrl"], message: "Select an OpenStreetMap HTTPS tile template" });
    }
    if (!settings.tileAttribution.includes("OpenStreetMap contributors")) {
        context.addIssue({ code: "custom", path: ["tileAttribution"], message: "OpenStreetMap attribution is required" });
    }
    if (settings.feeOver20Vnd <= settings.fee5To20Vnd) {
        context.addIssue({ code: "custom", path: ["feeOver20Vnd"], message: "The over-20km fee must be greater than the 5-20km fee" });
    }
});
