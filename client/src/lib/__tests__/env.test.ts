import { describe, it, expect } from "vitest";
import { API_BASE_URL } from "../env";

describe("env module", () => {
    it("exports a string API base URL", () => {
        expect(typeof API_BASE_URL).toBe("string");
        expect(API_BASE_URL.length).toBeGreaterThan(0);
    });

    it("uses the localhost URL when NODE_ENV is development", () => {
        if (process.env.NODE_ENV === "development") {
            expect(API_BASE_URL).toBe("http://localhost:4000");
        }
    });

    it("uses the production URL when NODE_ENV is production", () => {
        if (process.env.NODE_ENV === "production") {
            expect(API_BASE_URL).toBe("https://e-commerce-express-server-app.vercel.app");
        }
    });

    it("uses the localhost URL when NODE_ENV is not set", () => {
        if (process.env.NODE_ENV === undefined) {
            expect(API_BASE_URL).toBe("http://localhost:4000");
        }
    });
});
