import http from "k6/http";
import { check, group, sleep } from "k6";
import { Trend } from "k6/metrics";

export const options = {
    stages: [
        { duration: "20s", target: 3 },
        { duration: "40s", target: 6 },
        { duration: "20s", target: 0 },
    ],
    thresholds: {
        http_req_failed: ["rate<0.05"],
        http_req_duration: ["p(95)<1500"],
        checks: ["rate>0.95"],
    },
};

const BASE_URL = __ENV.BASE_URL || "http://localhost:4000";
const COOKIE = __ENV.COOKIE || "";

const ordersTrend = new Trend("admin_orders_duration");
const orderItemsTrend = new Trend("admin_order_items_duration");
const usersTrend = new Trend("admin_users_duration");
const userProfileTrend = new Trend("admin_user_profile_duration");
const analyticsTrend = new Trend("admin_analytics_duration");
const inventorySummaryTrend = new Trend("admin_inventory_summary_duration");
const inventoryMovementsTrend = new Trend("admin_inventory_movements_duration");
const promotionsTrend = new Trend("admin_promotions_duration");

const authHeaders = () => ({
    headers: COOKIE ? { Cookie: COOKIE } : {},
});

const getJson = (path, tags = {}) =>
    http.get(`${BASE_URL}${path}`, {
        headers: COOKIE ? { Cookie: COOKIE } : {},
        tags: { endpoint: path, ...tags },
    });

export default function () {
    if (!COOKIE) {
        throw new Error("COOKIE env var is required for admin read-only tests.");
    }

    group("admin orders", () => {
        const orders = getJson("/api/orders?page=1&limit=20");
        ordersTrend.add(orders.timings.duration);
        check(orders, {
            "orders endpoint authorized": (res) => res.status === 200,
            "orders returns array": (res) => Array.isArray(res.json("orders")),
        });

        const orderItems = getJson("/api/orders/item?limit=20");
        orderItemsTrend.add(orderItems.timings.duration);
        check(orderItems, {
            "order items endpoint authorized": (res) => res.status === 200,
            "order items returns array": (res) =>
                Array.isArray(res.json("orderItems")),
        });
    });

    group("admin users", () => {
        const users = getJson("/api/users?page=1&limit=20");
        usersTrend.add(users.timings.duration);
        check(users, {
            "users endpoint authorized": (res) => res.status === 200,
            "users returns accounts": (res) => Array.isArray(res.json("accounts")),
        });

        const accounts = users.json("accounts") || [];
        if (accounts.length > 0) {
            const userId = accounts[0].id;
            if (userId) {
                const userProfile = getJson(`/api/users/${userId}/profile`);
                userProfileTrend.add(userProfile.timings.duration);
                check(userProfile, {
                    "user profile endpoint authorized": (res) =>
                        res.status === 200,
                });
            }
        }
    });

    group("admin analytics", () => {
        const analytics = getJson("/api/analytics/summary");
        analyticsTrend.add(analytics.timings.duration);
        check(analytics, {
            "analytics endpoint authorized": (res) => res.status === 200,
            "analytics has overview": (res) => Boolean(res.json("overview")),
        });
    });

    group("admin inventory", () => {
        const inventorySummary = getJson(
            "/api/products/admin/inventory-summary",
        );
        inventorySummaryTrend.add(inventorySummary.timings.duration);
        check(inventorySummary, {
            "inventory summary endpoint authorized": (res) =>
                res.status === 200,
        });

        const inventoryMovements = getJson(
            "/api/products/admin/inventory-movements?limit=20",
        );
        inventoryMovementsTrend.add(inventoryMovements.timings.duration);
        check(inventoryMovements, {
            "inventory movements endpoint authorized": (res) =>
                res.status === 200,
            "inventory movements returns array": (res) =>
                Array.isArray(res.json("movements")),
        });
    });

    group("admin promotions", () => {
        const promotions = getJson("/api/promotions");
        promotionsTrend.add(promotions.timings.duration);
        check(promotions, {
            "promotions endpoint authorized": (res) => res.status === 200,
        });
    });

    sleep(1);
}
