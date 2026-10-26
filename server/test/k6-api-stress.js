import { check, group } from "k6";
import { catalogSetupError, getJson, jsonBody } from "./k6-config.js";

const RAMP_DURATION = "30s";
const HOLD_DURATION = "1m";
const RAMP_DOWN_DURATION = "10s";
const STAGE_INTERVAL_SECONDS = 110;
const PRE_ALLOCATED_VUS = 32;
const MAX_VUS = 160;
const workflowRates = [10, 20, 40, 60, 80];
const searchTerms = ["arduino", "resistor", "sensor", "capacitor"];
const endpoints = [
  "catalog_list",
  "catalog_search",
  "product_detail",
  "catalog_facets",
];

const scenarios = {};
const thresholds = {};

for (const [index, rate] of workflowRates.entries()) {
  const stressLevel = `${rate}-workflows-per-second`;
  const scenarioName = `catalog_stress_${rate}_workflows_per_second`;
  const scenarioTags = { profile: "catalog-stress", stress_level: stressLevel };
  const abortingThreshold = (threshold) => [
    {
      threshold,
      abortOnFail: true,
      delayAbortEval: "30s",
    },
  ];

  scenarios[scenarioName] = {
    executor: "ramping-arrival-rate",
    startTime: `${index * STAGE_INTERVAL_SECONDS}s`,
    startRate: 0,
    timeUnit: "1s",
    preAllocatedVUs: PRE_ALLOCATED_VUS,
    maxVUs: MAX_VUS,
    stages: [
      { target: rate, duration: RAMP_DURATION },
      { target: rate, duration: HOLD_DURATION },
      { target: 0, duration: RAMP_DOWN_DURATION },
    ],
    gracefulStop: "10s",
    exec: "catalogWorkflow",
    tags: scenarioTags,
  };

  thresholds[`http_req_failed{stress_level:${stressLevel}}`] =
    abortingThreshold("rate<0.01");
  thresholds[`dropped_iterations{stress_level:${stressLevel}}`] =
    abortingThreshold("count==0");
  thresholds[`checks{stress_level:${stressLevel}}`] =
    abortingThreshold("rate>0.99");

  for (const endpoint of endpoints) {
    thresholds[
      `http_req_duration{profile:catalog-stress,stress_level:${stressLevel},endpoint:${endpoint}}`
    ] = abortingThreshold("p(95)<1200");
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
    profile: "catalog-stress",
  });
  const products = jsonBody(response, "products");
  const product = Array.isArray(products) ? products[0] : undefined;
  const productId = Number(product?.id);

  if (
    !check(response, {
      "stress setup returns a usable product": (res) =>
        res.status === 200 && Number.isInteger(productId) && productId > 0,
    })
  ) {
    throw new Error(catalogSetupError(response));
  }

  return { productId };
}

export function catalogWorkflow(data) {
  group("public catalog stress workflow", () => {
    const listing = getJson("/api/products?page=1&limit=20", {
      endpoint: "catalog_list",
      profile: "catalog-stress",
    });
    check(listing, {
      "catalog list returns products": (res) =>
        res.status === 200 && Array.isArray(jsonBody(res, "products")),
    });

    const term = searchTerms[__ITER % searchTerms.length];
    const search = getJson(
      `/api/products/search?q=${encodeURIComponent(term)}&page=1&limit=12`,
      { endpoint: "catalog_search", profile: "catalog-stress" },
    );
    check(search, {
      "catalog search returns products": (res) =>
        res.status === 200 && Array.isArray(jsonBody(res, "products")),
    });

    const detail = getJson(`/api/products/${data.productId}`, {
      endpoint: "product_detail",
      profile: "catalog-stress",
    });
    check(detail, {
      "product detail returns the selected product": (res) =>
        res.status === 200 &&
        Number(jsonBody(res, "product.id")) === data.productId,
    });

    const facets = getJson("/api/products/facets", {
      endpoint: "catalog_facets",
      profile: "catalog-stress",
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
    __ENV.K6_SUMMARY_PATH || "test-results/k6/catalog-stress-summary.json";
  return {
    [outputPath]: JSON.stringify(data, null, 2),
    stdout: `Machine-readable k6 summary saved to ${outputPath}\n`,
  };
}
