import { check, group } from "k6";
import { Trend } from "k6/metrics";
import { catalogSetupError, getJson, jsonBody } from "./k6-config.js";

const RATE = Number(__ENV.LOAD_RATE || 1);
const DURATION = String(__ENV.LOAD_DURATION || "2m").trim();
const durationMatch = DURATION.match(/^(\d+)(s|m)$/);
const durationSeconds = durationMatch
    ? Number(durationMatch[1]) * (durationMatch[2] === "m" ? 60 : 1)
    : 0;

if (!Number.isInteger(RATE) || RATE < 1 || RATE > 5) {
    throw new Error("LOAD_RATE must be an integer between 1 and 5 iterations per second.");
}

if (durationSeconds < 10 || durationSeconds > 300) {
    throw new Error("LOAD_DURATION must be between 10s and 5m (for example, 2m).");
}

const productListDuration = new Trend("catalog_load_product_list_duration");
const searchDuration = new Trend("catalog_load_search_duration");
const productDetailDuration = new Trend("catalog_load_product_detail_duration");
const facetsDuration = new Trend("catalog_load_facets_duration");
const searchTerms = ["arduino", "resistor", "sensor", "capacitor"];

export const options = {
    scenarios: {
        catalog_load: {
            executor: "ramping-arrival-rate",
            timeUnit: "1s",
            startRate: 0,
            stages: [
                { target: RATE, duration: "30s" },
                { target: RATE, duration: DURATION },
                { target: 0, duration: "30s" },
            ],
            preAllocatedVUs: 8,
            maxVUs: 30,
            exec: "catalogWorkflow",
            tags: { profile: "catalog-load" },
        },
    },
    setupTimeout: "30s",
    summaryTrendStats: ["avg", "min", "med", "max", "p(90)", "p(95)", "p(99)"],
    thresholds: {
        http_req_failed: ["rate<0.01"],
        checks: ["rate>0.99"],
        dropped_iterations: ["count==0"],
        "http_req_duration{profile:catalog-load,endpoint:catalog_list}": ["p(95)<1200"],
        "http_req_duration{profile:catalog-load,endpoint:catalog_search}": ["p(95)<1200"],
        "http_req_duration{profile:catalog-load,endpoint:product_detail}": ["p(95)<1200"],
        "http_req_duration{profile:catalog-load,endpoint:catalog_facets}": ["p(95)<1200"],
    },
};

export function setup() {
    const response = getJson("/api/products?page=1&limit=20", {
        endpoint: "setup_products",
        profile: "catalog-load",
    });
    const products = jsonBody(response, "products");
    const product = Array.isArray(products) ? products[0] : undefined;
    const productId = Number(product?.id);

    if (
        !check(response, {
            "load setup returns a usable product": (res) =>
                res.status === 200 && Number.isInteger(productId) && productId > 0,
        })
    ) {
        throw new Error(catalogSetupError(response));
    }

    return { productId };
}

export function catalogWorkflow(data) {
    group("public catalog read workflow", () => {
        const listing = getJson("/api/products?page=1&limit=20", {
            endpoint: "catalog_list",
            profile: "catalog-load",
        });
        productListDuration.add(listing.timings.duration);
        check(listing, {
            "catalog list returns products": (res) =>
                res.status === 200 && Array.isArray(jsonBody(res, "products")),
        });

        const term = searchTerms[__ITER % searchTerms.length];
        const search = getJson(
            `/api/products/search?q=${encodeURIComponent(term)}&page=1&limit=12`,
            { endpoint: "catalog_search", profile: "catalog-load" },
        );
        searchDuration.add(search.timings.duration);
        check(search, {
            "catalog search returns products": (res) =>
                res.status === 200 && Array.isArray(jsonBody(res, "products")),
        });

        const detail = getJson(`/api/products/${data.productId}`, {
            endpoint: "product_detail",
            profile: "catalog-load",
        });
        productDetailDuration.add(detail.timings.duration);
        check(detail, {
            "product detail returns the selected product": (res) =>
                res.status === 200 &&
                Number(jsonBody(res, "product.id")) === data.productId,
        });

        const facets = getJson("/api/products/facets", {
            endpoint: "catalog_facets",
            profile: "catalog-load",
        });
        facetsDuration.add(facets.timings.duration);
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
    const outputPath = __ENV.K6_SUMMARY_PATH ||
        "test-results/k6/catalog-load-summary.json";
    const summary = JSON.stringify(data, null, 2);
    return {
        [outputPath]: summary,
        stdout: `Machine-readable k6 summary saved to ${outputPath}\n`,
    };
}
