import http from "k6/http";
import { check, group, sleep } from "k6";
import { Trend } from "k6/metrics";

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

const BASE_URL = __ENV.BASE_URL || "http://localhost:4000";
const productDetailTrend = new Trend("product_detail_duration");
const productsListTrend = new Trend("products_list_duration");

const getJson = (path, tags = {}) =>
    http.get(`${BASE_URL}${path}`, {
        tags: {
            endpoint: path,
            ...tags,
        },
    });

export function setup() {
    const response = getJson("/api/products?page=1&limit=20", { phase: "setup" });
    const ok = check(response, {
        "setup products loaded": (res) => res.status === 200,
    });

    if (!ok) {
        return {
            productIds: [],
        };
    }

    const products = response.json("products") || [];
    return {
        productIds: products.slice(0, 10).map((product) => product.id).filter(Boolean),
    };
}

export default function (data) {
    group("public catalog", () => {
        const products = getJson("/api/products?page=1&limit=12");
        productsListTrend.add(products.timings.duration);

        check(products, {
            "products list status is 200": (res) => res.status === 200,
            "products list has products": (res) => (res.json("products") || []).length > 0,
        });
    });

    group("health", () => {
        const health = getJson("/api/health");

        check(health, {
            "health status is 200": (res) => res.status === 200,
            "health body is ok": (res) => res.json("status") === "ok",
        });
    });

    group("product detail and reviews", () => {
        const ids = __ENV.PRODUCT_ID ? [Number(__ENV.PRODUCT_ID)] : data.productIds || [];
        const productId = ids.length > 0 ? ids[__ITER % ids.length] : null;

        if (!productId) {
            return;
        }

        const product = getJson(`/api/products/${productId}`);
        productDetailTrend.add(product.timings.duration);

        check(product, {
            "product detail status is 200": (res) => res.status === 200,
            "product detail has product": (res) => Boolean(res.json("product.id")),
        });

        const reviews = getJson(`/api/reviews/${productId}`);
        check(reviews, {
            "reviews status is 200": (res) => res.status === 200,
            "reviews returns array": (res) => Array.isArray(res.json("reviews")),
        });
    });

    sleep(1);
}
