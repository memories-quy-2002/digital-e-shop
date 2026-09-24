import { check, group, sleep } from "k6";
import { catalogSetupError, getJson, jsonBody } from "./k6-config.js";

const VUS = Number(__ENV.SMOKE_VUS || 1);
const DURATION = __ENV.SMOKE_DURATION || "20s";

if (!Number.isInteger(VUS) || VUS < 1 || VUS > 5) {
    throw new Error("SMOKE_VUS must be an integer between 1 and 5.");
}

export const options = {
    scenarios: {
        public_api_smoke: {
            executor: "constant-vus",
            vus: VUS,
            duration: DURATION,
        },
    },
    thresholds: {
        http_req_failed: ["rate<0.01"],
        http_req_duration: ["p(95)<1200"],
        checks: ["rate>0.99"],
    },
};

export function setup() {
    const response = getJson(
        "/api/products?page=1&limit=100",
        { endpoint: "setup_products" },
    );
    const valid = check(response, {
        "setup catalog responds successfully": (res) => res.status === 200,
        "setup catalog includes a product array": (res) =>
            Array.isArray(jsonBody(res, "products")),
    });

    if (!valid) {
        throw new Error(catalogSetupError(response));
    }

    const products = jsonBody(response, "products");
    const categoryIds = Object.create(null);

    for (const product of products) {
        const id = Number(product.id);
        const category = product.category;
        const categoryId = String(
            product.categoryId ??
                product.category_id ??
                (category && typeof category === "object"
                    ? category.id ?? category.categoryId ?? ""
                    : category ?? ""),
        );

        if (Number.isInteger(id) && id > 0) {
            if (categoryId) {
                categoryIds[categoryId] = categoryIds[categoryId] || [];
                categoryIds[categoryId].push(id);
            }
        }
    }

    const comparisonIds = Object.keys(categoryIds)
        .map((categoryId) => categoryIds[categoryId])
        .find((ids) => ids.length >= 2)
        ?.slice(0, 2);
    const productIds = products
        .map((product) => Number(product.id))
        .filter((id) => Number.isInteger(id) && id > 0);

    if (productIds.length === 0) {
        throw new Error(
            "The test catalog is empty; seed the disposable test database first.",
        );
    }

    return { productIds, comparisonIds: comparisonIds || [] };
}

export default function (data) {
    group("health", () => {
        const response = getJson("/api/health", { endpoint: "health" });
        check(response, {
            "health returns 200": (res) => res.status === 200,
            "health reports ok": (res) => jsonBody(res, "status") === "ok",
        });
    });

    group("catalog discovery", () => {
        const listing = getJson(
            "/api/products?page=1&limit=20",
            { endpoint: "catalog_list" },
        );
        check(listing, {
            "catalog list returns 200": (res) => res.status === 200,
            "catalog list has products and pagination": (res) =>
                Array.isArray(jsonBody(res, "products")) &&
                Boolean(jsonBody(res, "pagination")),
        });

        const search = getJson(
            "/api/products/search?q=arduino&limit=6",
            { endpoint: "catalog_search" },
        );
        check(search, {
            "catalog search returns 200": (res) => res.status === 200,
            "catalog search has a product array": (res) =>
                Array.isArray(jsonBody(res, "products")),
        });

        const facets = getJson("/api/products/facets", {
            endpoint: "catalog_facets",
        });
        check(facets, {
            "catalog facets return 200": (res) => res.status === 200,
            "catalog facets have an object payload": (res) => {
                const body = jsonBody(res, "facets");
                return (
                    body !== null &&
                    typeof body === "object" &&
                    !Array.isArray(body)
                );
            },
        });
    });

    group("product detail and comparison", () => {
        const productId = data.productIds[__ITER % data.productIds.length];
        const detail = getJson(`/api/products/${productId}`, {
            endpoint: "product_detail",
        });
        check(detail, {
            "product detail returns 200": (res) => res.status === 200,
            "product detail matches the requested id": (res) => {
                const body = jsonBody(res);
                return Number(body?.product?.id) === productId;
            },
        });

        if (data.comparisonIds.length === 2) {
            const ids = data.comparisonIds.join(",");
            const comparison = getJson(
                `/api/products/compare?ids=${ids}`,
                { endpoint: "product_comparison" },
            );
            check(comparison, {
                "product comparison returns 200": (res) => res.status === 200,
                "comparison includes both products": (res) => {
                    const products = jsonBody(res)?.comparison?.products;
                    return Array.isArray(products) && products.length === 2;
                },
            });
        }
    });

    sleep(1);
}
