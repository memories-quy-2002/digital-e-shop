import { check, group, sleep } from "k6";
import { getJson as requestJson, jsonBody, requireEnv } from "./k6-config.js";

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

const USER_ID = __ENV.USER_ID || "";
const COOKIE = __ENV.COOKIE || "";
requireEnv(["USER_ID", "COOKIE"], "customer read-only tests");
const USER_PATH_ID = encodeURIComponent(USER_ID);

const getJson = (path, tags = {}) =>
    requestJson(path, tags, { Cookie: COOKIE });

export default function () {
    group("customer read-only account data", () => {
        const orders = getJson(`/api/orders/user/${USER_PATH_ID}`);
        check(orders, {
            "customer orders status is 200": (res) => res.status === 200,
            "customer orders returns array": (res) =>
                Array.isArray(jsonBody(res, "orders")),
        });

        const addresses = getJson(`/api/users/${USER_PATH_ID}/addresses`);
        check(addresses, {
            "addresses status is 200": (res) => res.status === 200,
            "addresses returns array": (res) =>
                Array.isArray(jsonBody(res, "addresses")),
        });

        const notifications = getJson(`/api/users/${USER_PATH_ID}/notifications?limit=20`);
        check(notifications, {
            "notifications status is 200": (res) => res.status === 200,
            "notifications returns array": (res) =>
                Array.isArray(jsonBody(res, "notifications")),
        });
    });

    sleep(1);
}
