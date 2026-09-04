import http from "k6/http";
import { check, group, sleep } from "k6";

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
const USER_ID = __ENV.USER_ID || "";
const COOKIE = __ENV.COOKIE || "";

const authHeaders = () => ({
    headers: COOKIE
        ? {
              Cookie: COOKIE,
          }
        : {},
});

const getJson = (path) => http.get(`${BASE_URL}${path}`, authHeaders());

export default function () {
    if (!USER_ID || !COOKIE) {
        throw new Error("USER_ID and COOKIE are required for customer read-only tests.");
    }

    group("customer read-only account data", () => {
        const orders = getJson(`/api/orders/user/${USER_ID}`);
        check(orders, {
            "customer orders status is 200": (res) => res.status === 200,
            "customer orders returns array": (res) => Array.isArray(res.json("orders")),
        });

        const addresses = getJson(`/api/users/${USER_ID}/addresses`);
        check(addresses, {
            "addresses status is 200": (res) => res.status === 200,
            "addresses returns array": (res) => Array.isArray(res.json("addresses")),
        });

        const notifications = getJson(`/api/users/${USER_ID}/notifications?limit=20`);
        check(notifications, {
            "notifications status is 200": (res) => res.status === 200,
            "notifications returns array": (res) => Array.isArray(res.json("notifications")),
        });
    });

    sleep(1);
}
