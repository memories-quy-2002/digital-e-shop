import { check, group, sleep } from "k6";
import { catalogSetupError, getJson, jsonBody } from "./k6-config.js";

const RAMP_DURATION = "30s";
const HOLD_DURATION = "1m";
const THINK_TIME_SECONDS = 1;
const searchTerms = ["arduino", "resistor", "sensor", "capacitor"];
const endpoints = [
  "catalog_list",
  "catalog_search",
  "product_detail",
  "catalog_facets",
];
const loadLevels = [10, 25, 50, 100];

const scenarios = {};
for (const [index, vus] of loadLevels.entries()) {
  scenarios[`catalog_${vus}_vus`] = {
    executor: "ramping-vus",
    startVUs: 0,
    startTime: index === 0 ? "0s" : `${index * 2}m`,
    stages: [
      { target: vus, duration: RAMP_DURATION },
      { target: vus, duration: HOLD_DURATION },
      { target: 0, duration: RAMP_DURATION },
    ],
    gracefulRampDown: RAMP_DURATION,
    exec: "catalogWorkflow",
    tags: { profile: "catalog-vu-capacity", load_level: `${vus}-vus` },
  };
}

const thresholds = {
  http_req_failed: ["rate<0.01"],
  checks: ["rate>0.99"],
};

for (const vus of loadLevels) {
  const loadLevel = `${vus}-vus`;
  thresholds[`http_req_failed{load_level:${loadLevel}}`] = ["rate<0.01"];
  thresholds[`checks{load_level:${loadLevel}}`] = ["rate>0.99"];

  for (const endpoint of endpoints) {
    thresholds[
      `http_req_duration{profile:catalog-vu-capacity,load_level:${loadLevel},endpoint:${endpoint}}`
    ] = ["p(95)<1200"];
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
    profile: "catalog-vu-capacity",
  });
  const products = jsonBody(response, "products");
  const product = Array.isArray(products) ? products[0] : undefined;
  const productId = Number(product?.id);

  if (
    !check(response, {
      "capacity setup returns a usable product": (res) =>
        res.status === 200 && Number.isInteger(productId) && productId > 0,
    })
  ) {
    throw new Error(catalogSetupError(response));
  }

  return { productId };
}

export function catalogWorkflow(data) {
  group("public catalog capacity workflow", () => {
    const listing = getJson("/api/products?page=1&limit=20", {
      endpoint: "catalog_list",
      profile: "catalog-vu-capacity",
    });
    check(listing, {
      "catalog list returns products": (res) =>
        res.status === 200 && Array.isArray(jsonBody(res, "products")),
    });

    const term = searchTerms[__ITER % searchTerms.length];
    const search = getJson(
      `/api/products/search?q=${encodeURIComponent(term)}&page=1&limit=12`,
      { endpoint: "catalog_search", profile: "catalog-vu-capacity" },
    );
    check(search, {
      "catalog search returns products": (res) =>
        res.status === 200 && Array.isArray(jsonBody(res, "products")),
    });

    const detail = getJson(`/api/products/${data.productId}`, {
      endpoint: "product_detail",
      profile: "catalog-vu-capacity",
    });
    check(detail, {
      "product detail returns the selected product": (res) =>
        res.status === 200 &&
        Number(jsonBody(res, "product.id")) === data.productId,
    });

    const facets = getJson("/api/products/facets", {
      endpoint: "catalog_facets",
      profile: "catalog-vu-capacity",
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

  sleep(THINK_TIME_SECONDS);
}

export function handleSummary(data) {
  const outputPath =
    __ENV.K6_SUMMARY_PATH || "test-results/k6/catalog-vu-capacity-summary.json";
  return {
    [outputPath]: JSON.stringify(data, null, 2),
    stdout: `Machine-readable k6 summary saved to ${outputPath}\n`,
  };
}
