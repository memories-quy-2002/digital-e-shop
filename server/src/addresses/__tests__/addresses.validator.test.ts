import { describe, expect, it } from "vitest";
import { addressSchema } from "../addresses.validator";

describe("addressSchema", () => {
    it("accepts bounded carrier location codes and names", () => {
        expect(addressSchema.parse({
            addressLine: "12 Main Street",
            provinceCode: "202",
            provinceName: "Ho Chi Minh City",
            wardCode: "26734",
            wardName: "Ben Nghe Ward",
        })).toMatchObject({
            provinceCode: "202",
            provinceName: "Ho Chi Minh City",
            wardCode: "26734",
            wardName: "Ben Nghe Ward",
        });
    });

    it("accepts an optional manually selected map pin", () => {
        expect(addressSchema.parse({ addressLine: "12 Main Street", latitude: 10.7769, longitude: 106.7009 }))
            .toMatchObject({ latitude: 10.7769, longitude: 106.7009 });
        expect(addressSchema.parse({ addressLine: "12 Main Street" })).toMatchObject({ addressLine: "12 Main Street" });
    });

    it("rejects partial or out-of-range map coordinates", () => {
        expect(addressSchema.safeParse({ addressLine: "12 Main Street", latitude: 10.7 }).success).toBe(false);
        expect(addressSchema.safeParse({ addressLine: "12 Main Street", latitude: 91, longitude: 106.7 }).success).toBe(false);
    });
});
