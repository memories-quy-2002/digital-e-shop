import http from "k6/http";
import { check, group, sleep } from "k6";
import { Trend } from "k6/metrics";

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

const BASE_URL = __ENV.BASE_URL || "http://localhost:4000";
const USER_ID = __ENV.USER_ID || "";
const COOKIE = __ENV.COOKIE || "";

const meTrend = new Trend("auth_me_duration");
const orderByIdTrend = new Trend("auth_order_by_id_duration");
const userOrdersTrend = new Trend("auth_user_orders_duration");
const cartTrend = new Trend("auth_cart_duration");
const cartValidationTrend = new Trend("auth_cart_validation_duration");
const wishlistTrend = new Trend("auth_wishlist_duration");
const addressesTrend = new Trend("auth_addresses_duration");
const notificationsTrend = new Trend("auth_notifications_duration");

const authHeaders = () => ({
    headers: COOKIE ? { Cookie: COOKIE } : {},
});

const getJson = (path, tags = {}) =>
    http.get(`${BASE_URL}${path}`, {
        headers: COOKIE ? { Cookie: COOKIE } : {},
        tags: { endpoint: path, ...tags },
    });

export default function () {
    if (!USER_ID || !COOKIE) {
        throw new Error(
            "USER_ID and COOKIE env vars are required for auth read-only tests.",
        );
    }

    group("authenticated user profile", () => {
        const me = getJson("/api/users/me");
        meTrend.add(me.timings.duration);
        check(me, {
            "user profile status is 200": (res) => res.status === 200,
        });
    });

    group("customer orders", () => {
        const userOrders = getJson(`/api/orders/user/${USER_ID}`);
        userOrdersTrend.add(userOrders.timings.duration);
        check(userOrders, {
            "customer orders status is 200": (res) => res.status === 200,
            "customer orders returns array": (res) =>
                Array.isArray(res.json("orders")),
        });

        const orders = userOrders.json("orders") || [];
        if (orders.length > 0) {
            const orderId = orders[0].id;
            if (orderId) {
                const order = getJson(`/api/orders/${orderId}`);
                orderByIdTrend.add(order.timings.duration);
                check(order, {
                    "single order status is 200": (res) =>
                        res.status === 200,
                });
            }
        }
    });

    group("customer cart and wishlist", () => {
        const cart = getJson(`/api/cart/${USER_ID}`);
        cartTrend.add(cart.timings.duration);
        check(cart, {
            "cart status is 200": (res) => res.status === 200,
            "cart returns array": (res) =>
                Array.isArray(res.json("cartItems")),
        });

        const cartValidation = getJson(`/api/cart/${USER_ID}/validation`);
        cartValidationTrend.add(cartValidation.timings.duration);
        check(cartValidation, {
            "cart validation status is 200": (res) => res.status === 200,
        });

        const wishlist = getJson(`/api/wishlist/${USER_ID}`);
        wishlistTrend.add(wishlist.timings.duration);
        check(wishlist, {
            "wishlist status is 200": (res) => res.status === 200,
            "wishlist returns array": (res) =>
                Array.isArray(res.json("wishlistItems")),
        });
    });

    group("customer addresses and notifications", () => {
        const addresses = getJson(`/api/users/${USER_ID}/addresses`);
        addressesTrend.add(addresses.timings.duration);
        check(addresses, {
            "addresses status is 200": (res) => res.status === 200,
            "addresses returns array": (res) =>
                Array.isArray(res.json("addresses")),
        });

        const notifications = getJson(
            `/api/users/${USER_ID}/notifications?limit=20`,
        );
        notificationsTrend.add(notifications.timings.duration);
        check(notifications, {
            "notifications status is 200": (res) => res.status === 200,
            "notifications returns array": (res) =>
                Array.isArray(res.json("notifications")),
        });
    });

    sleep(1);
}
