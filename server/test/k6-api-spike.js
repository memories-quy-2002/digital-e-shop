import { check, group } from "k6";
import { catalogSetupError, getJson, jsonBody } from "./k6-config.js";

const BASELINE_RATE = Number(__ENV.SPIKE_BASELINE_RATE || 10);
const SPIKE_RATE = Number(__ENV.SPIKE_RATE || 40);
const PRE_ALLOCATED_VUS = 32;
const MAX_VUS = 160;
const searchTerms = ["arduino", "resistor", "sensor", "capacitor"];
const endpoints = [
    "catalog_list",
    "catalog_search",
    "product_detail",
    "catalog_facets",
];
const phases = [
    { name: "baseline", startTime: "0s", rate: BASELINE_RATE, duration: "2m" },
    { name: "spike", startTime: "130s", rate: SPIKE_RATE, duration: "1m" },
    {
        name: "recovery",
        startTime: "200s",
        rate: BASELINE_RATE,
        duration: "2m",
    },
];

if (
    !Number.isInteger(BASELINE_RATE) ||
    BASELINE_RATE < 1 ||
    BASELINE_RATE > 20
) {
    throw new Error(
        "SPIKE_BASELINE_RATE must be an integer from 1 to 20 workflows per second.",
    );
}

if (
    !Number.isInteger(SPIKE_RATE) ||
    SPIKE_RATE <= BASELINE_RATE ||
    SPIKE_RATE > 80
) {
    throw new Error(
        "SPIKE_RATE must be an integer above SPIKE_BASELINE_RATE and at most 80 workflows per second.",
    );
}

const scenarios = {};
const thresholds = {};
const taggedThreshold = (threshold) => [
    { threshold, abortOnFail: true, delayAbortEval: "30s" },
];

for (const { name, startTime, rate, duration } of phases) {
    scenarios[`catalog_spike_${name}`] = {
        executor: "constant-arrival-rate",
        startTime,
        rate,
        timeUnit: "1s",
        duration,
        preAllocatedVUs: PRE_ALLOCATED_VUS,
        maxVUs: MAX_VUS,
        gracefulStop: "10s",
        exec: "catalogWorkflow",
        tags: { profile: "catalog-spike", phase: name },
    };

    thresholds[`http_req_failed{phase:${name}}`] = taggedThreshold("rate<0.01");
    thresholds[`dropped_iterations{phase:${name}}`] =
        taggedThreshold("count==0");
    thresholds[`checks{phase:${name}}`] = taggedThreshold("rate>0.99");

    for (const endpoint of endpoints) {
        thresholds[
            `http_req_duration{profile:catalog-spike,phase:${name},endpoint:${endpoint}}`
        ] = taggedThreshold("p(95)<1200");
    }
}

export const options = {
    scenarios,
    setupTimeout: "30s",
    summaryTrendStats: ["avg", "min", "med", "max", "p(90)", "p(95)", "p(99)"],
    thresholds,
};

export function setup() {
    const response = getJson("/api/products?page=1&limit=20", {
        endpoint: "setup_products",
        profile: "catalog-spike",
    });
    const products = jsonBody(response, "products");
    const product = Array.isArray(products) ? products[0] : undefined;
    const productId = Number(product?.id);

    if (
        !check(response, {
            "spike setup returns a usable product": (res) =>
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
    group("public catalog spike workflow", () => {
        const listing = getJson("/api/products?page=1&limit=20", {
            endpoint: "catalog_list",
            profile: "catalog-spike",
        });
        check(listing, {
            "catalog list returns products": (res) =>
                res.status === 200 && Array.isArray(jsonBody(res, "products")),
        });

        const term = searchTerms[__ITER % searchTerms.length];
        const search = getJson(
            `/api/products/search?q=${encodeURIComponent(term)}&page=1&limit=12`,
            { endpoint: "catalog_search", profile: "catalog-spike" },
        );
        check(search, {
            "catalog search returns products": (res) =>
                res.status === 200 && Array.isArray(jsonBody(res, "products")),
        });

        const detail = getJson(`/api/products/${data.productId}`, {
            endpoint: "product_detail",
            profile: "catalog-spike",
        });
        check(detail, {
            "product detail returns the selected product": (res) =>
                res.status === 200 &&
                Number(jsonBody(res, "product.id")) === data.productId,
        });

        const facets = getJson("/api/products/facets", {
            endpoint: "catalog_facets",
            profile: "catalog-spike",
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
        __ENV.K6_SUMMARY_PATH || "test-results/k6/catalog-spike-summary.json";
    return {
        [outputPath]: JSON.stringify(data, null, 2),
        stdout: `Machine-readable k6 summary saved to ${outputPath}\n`,
    };
}
