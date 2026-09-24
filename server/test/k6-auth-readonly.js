import { check, group, sleep } from "k6";
import { Trend } from "k6/metrics";
import { getJson as requestJson, jsonBody, requireEnv } from "./k6-config.js";

export const options = {
    stages: [
        { duration: "20s", target: 3 },
        { duration: "40s", target: 8 },
        { duration: "20s", target: 0 },
    ],
    thresholds: {
        http_req_failed: ["rate<0.05"],
        http_req_duration: ["p(95)<1500"],
        checks: ["rate>0.95"],
    },
};

const USER_ID = __ENV.USER_ID || "";
const COOKIE = __ENV.COOKIE || "";
requireEnv(["USER_ID", "COOKIE"], "authenticated read-only tests");
const USER_PATH_ID = encodeURIComponent(USER_ID);

const meTrend = new Trend("auth_me_duration");
const orderByIdTrend = new Trend("auth_order_by_id_duration");
const userOrdersTrend = new Trend("auth_user_orders_duration");
const cartTrend = new Trend("auth_cart_duration");
const cartValidationTrend = new Trend("auth_cart_validation_duration");
const wishlistTrend = new Trend("auth_wishlist_duration");
const addressesTrend = new Trend("auth_addresses_duration");
const notificationsTrend = new Trend("auth_notifications_duration");

const getJson = (path, tags = {}) =>
    requestJson(path, tags, { Cookie: COOKIE });

export default function () {
    group("authenticated user profile", () => {
        const me = getJson("/api/users/me");
        meTrend.add(me.timings.duration);
        check(me, {
            "user profile status is 200": (res) => res.status === 200,
        });
    });

    group("customer orders", () => {
        const userOrders = getJson(`/api/orders/user/${USER_PATH_ID}`);
        userOrdersTrend.add(userOrders.timings.duration);
        check(userOrders, {
            "customer orders status is 200": (res) => res.status === 200,
            "customer orders returns array": (res) =>
                Array.isArray(jsonBody(res, "orders")),
        });

        const orders = jsonBody(userOrders, "orders") || [];
        if (orders.length > 0) {
            const orderId = orders[0].id;
            if (orderId) {
                const order = getJson(
                    `/api/orders/${encodeURIComponent(String(orderId))}`,
                );
                orderByIdTrend.add(order.timings.duration);
                check(order, {
                    "single order status is 200": (res) =>
                        res.status === 200,
                });
            }
        }
    });

    group("customer cart and wishlist", () => {
        const cart = getJson(`/api/cart/${USER_PATH_ID}`);
        cartTrend.add(cart.timings.duration);
        check(cart, {
            "cart status is 200": (res) => res.status === 200,
            "cart returns array": (res) =>
                Array.isArray(jsonBody(res, "cartItems")),
        });

        const cartValidation = getJson(`/api/cart/${USER_PATH_ID}/validation`);
        cartValidationTrend.add(cartValidation.timings.duration);
        check(cartValidation, {
            "cart validation status is 200": (res) => res.status === 200,
        });

        const wishlist = getJson(`/api/wishlist/${USER_PATH_ID}`);
        wishlistTrend.add(wishlist.timings.duration);
        check(wishlist, {
            "wishlist status is 200": (res) => res.status === 200,
            "wishlist returns array": (res) =>
                Array.isArray(jsonBody(res, "wishlistItems")),
        });
    });

    group("customer addresses and notifications", () => {
        const addresses = getJson(`/api/users/${USER_PATH_ID}/addresses`);
        addressesTrend.add(addresses.timings.duration);
        check(addresses, {
            "addresses status is 200": (res) => res.status === 200,
            "addresses returns array": (res) =>
                Array.isArray(jsonBody(res, "addresses")),
        });

        const notifications = getJson(
            `/api/users/${USER_PATH_ID}/notifications?limit=20`,
        );
        notificationsTrend.add(notifications.timings.duration);
        check(notifications, {
            "notifications status is 200": (res) => res.status === 200,
            "notifications returns array": (res) =>
                Array.isArray(jsonBody(res, "notifications")),
        });
    });

    sleep(1);
}
