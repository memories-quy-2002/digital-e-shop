import { describe, expect, it } from "vitest";
import { calculateDeliveryFee } from "./delivery.policy";

describe("calculateDeliveryFee", () => {
    const bands = { fee5To20Vnd: 25000, feeOver20Vnd: 50000 };

    it.each([
        [4999, 0],
        [5000, 25000],
        [20000, 25000],
        [20001, 50000],
    ])("prices %i route meters at %i VND", (distanceMeters, expectedFee) => {
        expect(calculateDeliveryFee(distanceMeters, bands)).toBe(expectedFee);
    });

    it.each([
        [-1, bands],
        [1.5, bands],
        [Number.MAX_SAFE_INTEGER + 1, bands],
        [5000, { fee5To20Vnd: 1.5, feeOver20Vnd: 2 }],
        [5000, { fee5To20Vnd: -1, feeOver20Vnd: 2 }],
        [5000, { fee5To20Vnd: 2, feeOver20Vnd: 2 }],
    ])("rejects invalid distance or fee bands", (distanceMeters, feeBands) => {
        expect(() => calculateDeliveryFee(distanceMeters, feeBands)).toThrow();
    });
});
