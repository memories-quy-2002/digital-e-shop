export const GEOAPIFY_ROUTING_ENDPOINT = "https://api.geoapify.com/v1/routing";

export function normalizeRoutingEndpoint(endpoint: string): string | null {
    try {
        const url = new URL(endpoint);
        if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) return null;
        return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
    } catch {
        return null;
    }
}

export function isGeoapifyRoutingEndpoint(endpoint: string): boolean {
    return normalizeRoutingEndpoint(endpoint) === GEOAPIFY_ROUTING_ENDPOINT;
}

export function isRoutingEndpointAllowed(endpoint: string, allowlist: readonly string[]): boolean {
    const normalizedEndpoint = normalizeRoutingEndpoint(endpoint);
    return normalizedEndpoint !== null
        && allowlist.some((allowedEndpoint) => normalizeRoutingEndpoint(allowedEndpoint) === normalizedEndpoint);
}
