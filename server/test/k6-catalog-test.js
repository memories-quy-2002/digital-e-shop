import http from "k6/http";
import { check, group, sleep } from "k6";
import { Trend } from "k6/metrics";

export const options = {
    stages: [
        { duration: "30s", target: 10 },
        { duration: "1m", target: 30 },
        { duration: "2m", target: 30 },
        { duration: "30s", target: 0 },
    ],
    thresholds: {
        http_req_failed: ["rate<0.05"],
        http_req_duration: ["p(95)<1200"],
        checks: ["rate>0.95"],
    },
};

const BASE_URL = __ENV.BASE_URL || "http://localhost:4000";

const productListTrend = new Trend("catalog_product_list_duration");
const productDetailTrend = new Trend("catalog_product_detail_duration");
const searchTrend = new Trend("catalog_search_duration");
const facetsTrend = new Trend("catalog_facets_duration");
const recommendationsTrend = new Trend("catalog_recommendations_duration");
const relevantTrend = new Trend("catalog_relevant_duration");
const reviewsTrend = new Trend("catalog_reviews_duration");
const csrfTrend = new Trend("catalog_csrf_duration");
const healthTrend = new Trend("catalog_health_duration");
const blobHealthTrend = new Trend("catalog_blob_health_duration");

const getJson = (path, tags = {}) =>
    http.get(`${BASE_URL}${path}`, {
        tags: { endpoint: path, ...tags },
    });

export function setup() {
    const response = getJson("/api/products?page=1&limit=20", { phase: "setup" });
    const ok = check(response, {
        "setup products loaded": (res) => res.status === 200,
    });

    if (!ok) {
        return { productIds: [], userId: null };
    }

    const products = response.json("products") || [];
    const productIds = products
        .slice(0, 10)
        .map((p) => p.id)
        .filter(Boolean);

    const userId = products.length > 0 && products[0].user_id ? products[0].user_id : null;

    return { productIds, userId };
}

export default function (data) {
    group("health check", () => {
        const health = getJson("/api/health");
        healthTrend.add(health.timings.duration);
        check(health, {
            "health status is 200": (res) => res.status === 200,
            "health body is ok": (res) => res.json("status") === "ok",
        });

        const csrf = getJson("/api/csrf");
        csrfTrend.add(csrf.timings.duration);
        check(csrf, {
            "csrf status is 200": (res) => res.status === 200,
        });

        const blobHealth = getJson("/api/blob/health");
        blobHealthTrend.add(blobHealth.timings.duration);
        check(blobHealth, {
            "blob health status is 200 or 503": (res) =>
                res.status === 200 || res.status === 503,
        });
    });

    group("product listing", () => {
        const page = (__ITER % 3) + 1;
        const products = getJson(`/api/products?page=${page}&limit=12`);
        productListTrend.add(products.timings.duration);
        check(products, {
            "products list status is 200": (res) => res.status === 200,
            "products list has products": (res) =>
                Array.isArray(res.json("products")),
        });
    });

    group("product detail and reviews", () => {
        const ids = __ENV.PRODUCT_ID
            ? [Number(__ENV.PRODUCT_ID)]
            : data.productIds || [];
        const productId = ids.length > 0 ? ids[__ITER % ids.length] : null;

        if (!productId) {
            return;
        }

        const product = getJson(`/api/products/${productId}`);
        productDetailTrend.add(product.timings.duration);
        check(product, {
            "product detail status is 200": (res) => res.status === 200,
        });

        const reviews = getJson(`/api/reviews/${productId}`);
        reviewsTrend.add(reviews.timings.duration);
        check(reviews, {
            "reviews status is 200": (res) => res.status === 200,
            "reviews returns array": (res) => Array.isArray(res.json("reviews")),
        });

        const relevant = getJson(`/api/products/relevant/${productId}`);
        relevantTrend.add(relevant.timings.duration);
        check(relevant, {
            "relevant products status is 200": (res) => res.status === 200,
        });
    });

    group("search and facets", () => {
        const searchTerms = ["resistor", "capacitor", "arduino", "sensor"];
        const term = searchTerms[__ITER % searchTerms.length];

        const search = getJson(`/api/products/search?q=${term}&page=1&limit=12`);
        searchTrend.add(search.timings.duration);
        check(search, {
            "search status is 200": (res) => res.status === 200,
        });

        const facets = getJson("/api/products/facets");
        facetsTrend.add(facets.timings.duration);
        check(facets, {
            "facets status is 200": (res) => res.status === 200,
        });
    });

    group("recommendations", () => {
        const uid = data.userId || 1;
        const recommendations = getJson(`/api/products/recommendations/${uid}`);
        recommendationsTrend.add(recommendations.timings.duration);
        check(recommendations, {
            "recommendations status is 200": (res) => res.status === 200,
        });
    });

    sleep(1);
}
