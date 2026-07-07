import http from "k6/http";
import { check, group, sleep } from "k6";
import { Trend } from "k6/metrics";

const IS_COLD_START = __ENV.COLD_START === "true";

export const options = {
    stages: [
        { duration: "30s", target: 10 },
        { duration: "30s", target: 20 },
        { duration: "30s", target: 0 },
    ],
    thresholds: {
        http_req_failed: ["rate<0.05"],
        checks: ["rate>0.95"],
    },
};

const BASE_URL = __ENV.BASE_URL || "http://localhost:4000";

const productListTrend = new Trend("redis_products_list");
const productDetailTrend = new Trend("redis_product_detail");
const searchTrend = new Trend("redis_search");
const facetsTrend = new Trend("redis_facets");
const inventoryOverviewTrend = new Trend("redis_inventory_overview");

const getJson = (path, tags = {}) =>
    http.get(`${BASE_URL}${path}`, {
        tags: { endpoint: path, ...tags },
    });

export function setup() {
    if (IS_COLD_START) {
        const clearResp = http.post(`${BASE_URL}/api/cache/invalidate?pattern=*`);
        check(clearResp, {
            "cache cleared": (res) => res.status === 200,
        });
    }

    const response = getJson("/api/products?page=1&limit=20", { phase: "setup" });
    const ok = check(response, {
        "setup products loaded": (res) => res.status === 200,
    });

    if (!ok) {
        return { productIds: [], cacheHeader: null };
    }

    const cacheHeader = response.headers["X-Cache"];
    const products = response.json("products") || [];
    const productIds = products.slice(0, 8).map((p) => p.id).filter(Boolean);

    return { productIds, cacheHeader, isCold: IS_COLD_START };
}

export default function (data) {
    const searchTerms = ["arduino", "sensor", "gpu", "led"];

    group("products list (paginated)", () => {
        const page = (__ITER % 3) + 1;
        const resp = getJson(`/api/products?page=${page}&limit=12`);
        productListTrend.add(resp.timings.duration);
        check(resp, {
            "products list 200": (res) => res.status === 200,
        });
    });

    group("product detail", () => {
        const ids = data.productIds || [];
        const productId = ids.length > 0 ? ids[__ITER % ids.length] : null;
        if (!productId) return;

        const resp = getJson(`/api/products/${productId}`);
        productDetailTrend.add(resp.timings.duration);
        check(resp, {
            "product detail 200": (res) => res.status === 200,
        });
    });

    group("search", () => {
        const term = searchTerms[__ITER % searchTerms.length];
        const resp = getJson(`/api/products/search?q=${term}&limit=12`);
        searchTrend.add(resp.timings.duration);
        check(resp, {
            "search 200": (res) => res.status === 200,
        });
    });

    group("facets", () => {
        const resp = getJson("/api/products/facets");
        facetsTrend.add(resp.timings.duration);
        check(resp, {
            "facets 200": (res) => res.status === 200,
        });
    });

    sleep(1);
}

export function teardown(data) {
    console.log("");
    console.log("═══════════════════════════════════════");
    console.log(
        `  Redis Cache Benchmark — ${data?.isCold ? "COLD (cache empty)" : "WARM (cache populated)"}`,
    );
    console.log("═══════════════════════════════════════");
    console.log("  Run again WITHOUT COLD_START to compare warm-cache results.");
    console.log("");
}
