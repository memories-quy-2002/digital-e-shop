import { describe, expect, it } from "vitest";
import { buildErrorResponse, buildSuccessResponse } from "./api-response";

describe("API response contract", () => {
    it("adds canonical success metadata without moving legacy payload fields", () => {
        expect(buildSuccessResponse({ products: [{ id: 1 }], msg: "Products loaded" }, "req-123")).toEqual({
            products: [{ id: 1 }],
            msg: "Products loaded",
            success: true,
            requestId: "req-123",
        });
    });

    it("wraps non-object success values in data", () => {
        expect(buildSuccessResponse(["ok"], "req-456")).toEqual({
            data: ["ok"],
            success: true,
            requestId: "req-456",
        });
    });

    it("returns one error envelope while preserving legacy msg and details", () => {
        expect(buildErrorResponse({
            statusCode: 409,
            code: "CHECKOUT_CONFLICT",
            message: "Stock changed",
            details: { issues: [{ productId: 7 }] },
            requestId: "req-789",
        })).toEqual({
            success: false,
            error: "Stock changed",
            msg: "Stock changed",
            code: "CHECKOUT_CONFLICT",
            requestId: "req-789",
            details: { issues: [{ productId: 7 }] },
            issues: [{ productId: 7 }],
        });
    });
});
