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
});
