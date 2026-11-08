type StorefrontEvent =
    | { name: "Storefront Search Result"; properties: { outcome: "found" | "empty" } }
    | { name: "Storefront Cart Validation"; properties: { outcome: "ready" | "blocked"; reason: "none" | "stock" | "validation" | "unavailable"; recovered: boolean } }
    | { name: "Storefront Checkout Attempt"; properties: { outcome: "ready" | "blocked"; reason: "none" | "stock" | "quote" | "validation" | "unavailable"; recovered: boolean } };

export function trackStorefrontEvent(event: StorefrontEvent): void {
    if (!import.meta.env.PROD) return;
    void import("@vercel/analytics")
        .then(({ track }) => track(event.name, event.properties))
        .catch(() => undefined);
}
