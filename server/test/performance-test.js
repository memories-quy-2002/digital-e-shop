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
        { duration: "30s", target: 5 },
        { duration: "1m", target: 10 },
        { duration: "30s", target: 0 },
    ],
    thresholds: {
        http_req_failed: ["rate<0.05"],
        http_req_duration: ["p(95)<1200"],
        checks: ["rate>0.95"],
    },
};

const productDetailTrend = new Trend("product_detail_duration");
const productsListTrend = new Trend("products_list_duration");
const searchTrend = new Trend("search_duration");
const facetsTrend = new Trend("facets_duration");
const reviewsTrend = new Trend("reviews_duration");
const csrfTrend = new Trend("csrf_duration");
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
    group("health", () => {
        const health = getJson("/api/health");
        check(health, {
            "health status is 200": (res) => res.status === 200,
            "health body is ok": (res) => jsonBody(res, "status") === "ok",
        });

        const csrf = getJson("/api/csrf");
        csrfTrend.add(csrf.timings.duration);
        check(csrf, {
            "csrf token generated": (res) => res.status === 200,
        });
    });

    group("public catalog", () => {
        const products = getJson("/api/products?page=1&limit=12");
        productsListTrend.add(products.timings.duration);
        check(products, {
            "products list status is 200": (res) => res.status === 200,
            "products list has products": (res) =>
                (jsonBody(res, "products") || []).length > 0,
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
            "product detail has product": (res) =>
                Number(jsonBody(res, "product.id")) === Number(productId),
        });

        const reviews = getJson(`/api/reviews/${productId}`);
        reviewsTrend.add(reviews.timings.duration);
        check(reviews, {
            "reviews status is 200": (res) => res.status === 200,
            "reviews returns array": (res) =>
                Array.isArray(jsonBody(res, "reviews")),
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

    sleep(1);
}
