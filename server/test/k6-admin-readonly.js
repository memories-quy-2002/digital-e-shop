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
    group("admin read-only dashboard data", () => {
        const orders = getJson("/api/orders?page=1&limit=20");
        check(orders, {
            "orders endpoint authorized": (res) => res.status === 200,
            "orders returns array": (res) => Array.isArray(res.json("orders")),
        });

        const users = getJson("/api/users?page=1&limit=20");
        check(users, {
            "users endpoint authorized": (res) => res.status === 200,
            "users returns accounts": (res) => Array.isArray(res.json("accounts")),
        });

        const analytics = getJson("/api/analytics/summary");
        check(analytics, {
            "analytics endpoint authorized": (res) => res.status === 200,
            "analytics has overview": (res) => Boolean(res.json("overview")),
        });
    });

    sleep(1);
}
