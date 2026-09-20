import { describe, expect, it } from "vitest";
import { getApiErrorCode, getApiErrorMessage, getApiSuccessMessage } from "./api-contract";

describe("API contract helpers", () => {
    it("prefers the canonical error message and code", () => {
        const error = {
            response: {
                data: {
                    success: false,
                    message: "Stock changed",
                    msg: "Legacy stock message",
                    error: "Legacy error message",
                    code: "CHECKOUT_CONFLICT",
                },
            },
        };

        expect(getApiErrorMessage(error, "fallback")).toBe("Stock changed");
        expect(getApiErrorCode(error)).toBe("CHECKOUT_CONFLICT");
    });

    it("keeps compatibility with legacy error payloads", () => {
        expect(getApiErrorMessage({ response: { data: { msg: "Legacy message" } } }, "fallback")).toBe("Legacy message");
        expect(getApiErrorMessage({ response: { data: { error: "Legacy error" } } }, "fallback")).toBe("Legacy error");
        expect(getApiErrorMessage({ response: { data: {} } }, "fallback")).toBe("fallback");
    });

    it("reads success messages from the canonical field before the legacy alias", () => {
        expect(getApiSuccessMessage({ message: "Saved", msg: "Legacy saved" })).toBe("Saved");
        expect(getApiSuccessMessage({ msg: "Legacy saved" })).toBe("Legacy saved");
    });
});
