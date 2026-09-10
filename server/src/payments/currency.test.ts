import { describe, expect, it } from "vitest";
import { buildPaymentQuote, convertUsdToVnd } from "./currency";

describe("payment currency", () => {
    it("rounds a USD amount to integer VND for PayOS", () => {
        expect(convertUsdToVnd(19.99, 25_000)).toBe(499_750);
    });

    it("rejects PayOS quotes without an explicit FX rate", () => {
        expect(() => buildPaymentQuote(10, "payos")).toThrow("PAYOS_USD_TO_VND_RATE");
    });

    it("keeps an explicitly VND catalog amount unchanged for PayOS", () => {
        expect(buildPaymentQuote(1_399_000, "payos", undefined, "VND")).toEqual({
            baseAmount: 1_399_000,
            baseCurrency: "VND",
            amount: 1_399_000,
            currency: "VND",
            fxRate: 1,
        });
    });
});
