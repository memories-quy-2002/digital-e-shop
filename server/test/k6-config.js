import http from "k6/http";

const DEFAULT_BASE_URL = "http://127.0.0.1:4000";

export const BASE_URL = (__ENV.BASE_URL || DEFAULT_BASE_URL)
    .trim()
    .replace(/\/+$/, "");

const targetMatch = BASE_URL.match(
    /^https?:\/\/(\[[^\]]+\]|[^/?#:]+)(?::\d+)?(?:\/|$)/i,
);

if (!targetMatch) {
    throw new Error("BASE_URL must be an absolute HTTP or HTTPS URL.");
}

const hostname = targetMatch[1].toLowerCase();
const isLocalTarget = ["localhost", "127.0.0.1", "[::1]"].includes(hostname);
const originMatch = BASE_URL.match(
    /^(https?:\/\/(?:\[[^\]]+\]|[^/?#:]+)(?::\d+)?)/i,
);
const BASE_ORIGIN = originMatch ? originMatch[1] : BASE_URL;

if (!isLocalTarget && __ENV.ALLOW_REMOTE_TEST_TARGET !== "true") {
    throw new Error(
        "Remote k6 target refused. Set ALLOW_REMOTE_TEST_TARGET=true only for an approved, non-production test deployment.",
    );
}

export function requireEnv(names, profile) {
    const missing = names.filter((name) => !String(__ENV[name] || "").trim());

    if (missing.length > 0) {
        throw new Error(`${missing.join(" and ")} env vars are required for ${profile}.`);
    }
}

export function positiveIntegerEnv(name) {
    const rawValue = String(__ENV[name] || "").trim();
    if (!rawValue) return undefined;

    const value = Number(rawValue);
    if (!Number.isInteger(value) || value < 1) {
        throw new Error(`${name} must be a positive integer.`);
    }

    return value;
}

export function jsonBody(response, path) {
    if (
        !response ||
        response.status < 200 ||
        response.status >= 300 ||
        response.body === null ||
        response.body === undefined
    ) {
        return undefined;
    }

    try {
        return path === undefined ? response.json() : response.json(path);
    } catch {
        return undefined;
    }
}

export function catalogSetupError(response) {
    const status = Number(response?.status || 0);

    if (status === 0) {
        const reason = response?.error ? ` (${response.error})` : "";
        return `Could not reach the catalog at ${BASE_ORIGIN}${reason}. Check BASE_URL and confirm the API is running.`;
    }

    const requestId = response?.headers?.["X-Request-Id"];
    const requestDetails = requestId ? ` Request ID: ${requestId}.` : "";

    if (status !== 200) {
        return `Catalog request to ${BASE_ORIGIN} returned HTTP ${status}.${requestDetails} Check the API response and test database seed.`;
    }

    return `Catalog request to ${BASE_ORIGIN} returned HTTP 200, but the JSON response did not contain a top-level products array. Check that BASE_URL points to the API server.`;
}

function normalizeEndpoint(path) {
    return path
        .split("?")[0]
        .replace(
            /(\/api\/(?:cart|wishlist|orders\/user|products\/(?:recommendations|relevant)|reviews)\/)[^/]+/g,
            "$1:id",
        )
        .replace(
            /(\/api\/users\/)[^/]+(?=\/(?:addresses|notifications|profile)(?:\/|$))/g,
            "$1:id",
        )
        .replace(/(\/api\/orders\/)[^/]+$/g, "$1:id")
        .replace(/\/(?:\d+|[A-Za-z0-9_-]{20,})(?=\/|$)/g, "/:id");
}

export function getJson(path, tags = {}, headers = {}, requestOptions = {}) {
    const { endpoint = normalizeEndpoint(path), ...extraTags } = tags;

    return http.get(`${BASE_URL}${path}`, {
        timeout: "10s",
        headers,
        tags: { endpoint, ...extraTags },
        ...requestOptions,
    });
}
