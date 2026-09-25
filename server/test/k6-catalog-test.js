import { check, group, sleep } from "k6";
import { Trend } from "k6/metrics";
import {
    catalogSetupError,
    getJson,
    jsonBody,
    positiveIntegerEnv,
} from "./k6-config.js";

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

const productListTrend = new Trend("catalog_product_list_duration");
const productDetailTrend = new Trend("catalog_product_detail_duration");
const searchTrend = new Trend("catalog_search_duration");
const facetsTrend = new Trend("catalog_facets_duration");
const recommendationsTrend = new Trend("catalog_recommendations_duration");
const relevantTrend = new Trend("catalog_relevant_duration");
const reviewsTrend = new Trend("catalog_reviews_duration");
const csrfTrend = new Trend("catalog_csrf_duration");
const healthTrend = new Trend("catalog_health_duration");
const configuredProductId = positiveIntegerEnv("PRODUCT_ID");

export function setup() {
    const response = getJson("/api/products?page=1&limit=20", { phase: "setup" });
    const ok = check(response, {
        "setup catalog returns products": (res) =>
            res.status === 200 && Array.isArray(jsonBody(res, "products")),
    });

    if (!ok) {
        throw new Error(catalogSetupError(response));
    }

    const products = jsonBody(response, "products") || [];
    const productIds = products
        .slice(0, 10)
        .map((product) => Number(product.id))
        .filter((id) => Number.isInteger(id) && id > 0);

    if (productIds.length === 0) {
        throw new Error("The test catalog is empty; seed the test database first.");
    }

    return { productIds };
}

export default function (data) {
    group("health check", () => {
        const health = getJson("/api/health");
        healthTrend.add(health.timings.duration);
        check(health, {
            "health status is 200": (res) => res.status === 200,
            "health body is ok": (res) => jsonBody(res, "status") === "ok",
        });

        const csrf = getJson("/api/csrf");
        csrfTrend.add(csrf.timings.duration);
        check(csrf, {
            "csrf status is 200": (res) => res.status === 200,
        });

    });

    group("product listing", () => {
        const page = (__ITER % 3) + 1;
        const products = getJson(`/api/products?page=${page}&limit=12`);
        productListTrend.add(products.timings.duration);
        check(products, {
            "products list status is 200": (res) => res.status === 200,
            "products list has products": (res) =>
                Array.isArray(jsonBody(res, "products")),
        });
    });

    group("product detail and reviews", () => {
        const ids = configuredProductId
            ? [configuredProductId]
            : data.productIds || [];
        const productId = ids.length > 0 ? ids[__ITER % ids.length] : null;

        if (!productId) {
            throw new Error("PRODUCT_ID must be a positive integer.");
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
            "reviews returns array": (res) =>
                Array.isArray(jsonBody(res, "reviews")),
        });

        const relevant = getJson(`/api/products/relevant/${productId}`);
        relevantTrend.add(relevant.timings.duration);
        check(relevant, {
            "relevant products status is 200": (res) => res.status === 200,
            "relevant products returns an array": (res) =>
                Array.isArray(jsonBody(res, "relevantProducts")),
        });
    });

    group("search and facets", () => {
        const searchTerms = ["resistor", "capacitor", "arduino", "sensor"];
        const term = searchTerms[__ITER % searchTerms.length];

        const search = getJson(`/api/products/search?q=${term}&page=1&limit=12`);
        searchTrend.add(search.timings.duration);
        check(search, {
            "search status is 200": (res) => res.status === 200,
            "search returns a product array": (res) =>
                Array.isArray(jsonBody(res, "products")),
        });

        const facets = getJson("/api/products/facets");
        facetsTrend.add(facets.timings.duration);
        check(facets, {
            "facets status is 200": (res) => res.status === 200,
            "facets returns an object": (res) => {
                const body = jsonBody(res, "facets");
                return body !== null && typeof body === "object" && !Array.isArray(body);
            },
        });
    });

    group("recommendations", () => {
        const userId = __ENV.RECOMMENDATION_USER_ID || "";
        if (userId) {
            const recommendations = getJson(
                `/api/products/recommendations/${encodeURIComponent(userId)}`,
            );
            recommendationsTrend.add(recommendations.timings.duration);
            check(recommendations, {
                "recommendations status is 200": (res) => res.status === 200,
                "recommendations returns a product array": (res) =>
                    Array.isArray(jsonBody(res, "products")),
            });
        }
    });

    sleep(1);
}
