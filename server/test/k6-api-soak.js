import { check, group } from "k6";
import { catalogSetupError, getJson, jsonBody } from "./k6-config.js";

const SOAK_RATE = Number(__ENV.SOAK_RATE || 20);
const SOAK_DURATION = String(__ENV.SOAK_DURATION || "30m").trim();
const durationMatch = SOAK_DURATION.match(/^(\d+)(m)$/);
const durationMinutes = durationMatch ? Number(durationMatch[1]) : 0;
const RAMP_DURATION = "30s";
const PRE_ALLOCATED_VUS = 32;
const MAX_VUS = 160;
const searchTerms = ["arduino", "resistor", "sensor", "capacitor"];
const endpoints = [
    "catalog_list",
    "catalog_search",
    "product_detail",
    "catalog_facets",
];

if (!Number.isInteger(SOAK_RATE) || SOAK_RATE < 1 || SOAK_RATE > 20) {
    throw new Error(
        "SOAK_RATE must be an integer from 1 to 20 workflows per second.",
    );
}

if (durationMinutes < 10 || durationMinutes > 60) {
    throw new Error(
        "SOAK_DURATION must be between 10m and 60m (for example, 30m).",
    );
}

const phase = "steady";
const taggedThreshold = (threshold) => [
    { threshold, abortOnFail: true, delayAbortEval: "60s" },
];
const thresholds = {
    [`http_req_failed{phase:${phase}}`]: taggedThreshold("rate<0.01"),
    [`dropped_iterations{phase:${phase}}`]: taggedThreshold("count==0"),
    [`checks{phase:${phase}}`]: taggedThreshold("rate>0.99"),
};

for (const endpoint of endpoints) {
    thresholds[
        `http_req_duration{profile:catalog-soak,phase:${phase},endpoint:${endpoint}}`
    ] = taggedThreshold("p(95)<1200");
}

export const options = {
    scenarios: {
        catalog_soak: {
            executor: "ramping-arrival-rate",
            startRate: 0,
            timeUnit: "1s",
            preAllocatedVUs: PRE_ALLOCATED_VUS,
            maxVUs: MAX_VUS,
            stages: [
                { target: SOAK_RATE, duration: RAMP_DURATION },
                { target: SOAK_RATE, duration: SOAK_DURATION },
                { target: 0, duration: RAMP_DURATION },
            ],
            gracefulStop: "10s",
            exec: "catalogWorkflow",
            tags: { profile: "catalog-soak", phase },
        },
    },
    setupTimeout: "30s",
    summaryTrendStats: ["avg", "min", "med", "max", "p(90)", "p(95)", "p(99)"],
    thresholds,
};

export function setup() {
    const response = getJson("/api/products?page=1&limit=20", {
        endpoint: "setup_products",
        profile: "catalog-soak",
    });
    const products = jsonBody(response, "products");
    const product = Array.isArray(products) ? products[0] : undefined;
    const productId = Number(product?.id);

    if (
        !check(response, {
            "soak setup returns a usable product": (res) =>
                res.status === 200 &&
                Number.isInteger(productId) &&
                productId > 0,
        })
    ) {
        throw new Error(catalogSetupError(response));
    }

    return { productId };
}

export function catalogWorkflow(data) {
    group("public catalog soak workflow", () => {
        const listing = getJson("/api/products?page=1&limit=20", {
            endpoint: "catalog_list",
            profile: "catalog-soak",
        });
        check(listing, {
            "catalog list returns products": (res) =>
                res.status === 200 && Array.isArray(jsonBody(res, "products")),
        });

        const term = searchTerms[__ITER % searchTerms.length];
        const search = getJson(
            `/api/products/search?q=${encodeURIComponent(term)}&page=1&limit=12`,
            { endpoint: "catalog_search", profile: "catalog-soak" },
        );
        check(search, {
            "catalog search returns products": (res) =>
                res.status === 200 && Array.isArray(jsonBody(res, "products")),
        });

        const detail = getJson(`/api/products/${data.productId}`, {
            endpoint: "product_detail",
            profile: "catalog-soak",
        });
        check(detail, {
            "product detail returns the selected product": (res) =>
                res.status === 200 &&
                Number(jsonBody(res, "product.id")) === data.productId,
        });

        const facets = getJson("/api/products/facets", {
            endpoint: "catalog_facets",
            profile: "catalog-soak",
        });
        check(facets, {
            "catalog facets returns an object": (res) => {
                const body = jsonBody(res, "facets");
                return (
                    res.status === 200 &&
                    body !== null &&
                    typeof body === "object" &&
                    !Array.isArray(body)
                );
            },
        });
    });
}

export function handleSummary(data) {
    const outputPath =
        __ENV.K6_SUMMARY_PATH || "test-results/k6/catalog-soak-summary.json";
    return {
        [outputPath]: JSON.stringify(data, null, 2),
        stdout: `Machine-readable k6 summary saved to ${outputPath}\n`,
    };
}
