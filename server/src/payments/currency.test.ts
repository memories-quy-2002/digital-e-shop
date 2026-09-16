import { describe, expect, it } from "vitest";
import { assertNewPaymentProvider } from "./payment.types";
import { buildPaymentQuote } from "./currency";

describe("payment currency", () => {
    it("keeps a VND PayOS amount unchanged and sets FX to one", () => {
        expect(buildPaymentQuote(1_399_000, "payos")).toEqual({
            baseAmount: 1_399_000,
            baseCurrency: "VND",
            amount: 1_399_000,
            currency: "VND",
            fxRate: 1,
        });
    });

    it("rounds a fractional compatibility input to a whole VND amount", () => {
        expect(buildPaymentQuote(10.6, "cash").amount).toBe(11);
    });

    it("rejects legacy providers before a payment is created", () => {
        expect(() => assertNewPaymentProvider("stripe")).toThrow("Unsupported payment method");
        expect(() => assertNewPaymentProvider("card")).toThrow("Unsupported payment method");
        expect(() => assertNewPaymentProvider("bank_transfer")).toThrow("Unsupported payment method");
    });
});
