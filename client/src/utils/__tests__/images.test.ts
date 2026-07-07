import { describe, it, expect } from "vitest";
import {
    PRODUCT_IMAGE_BASE_URL,
    normalizeProductImageName,
    getProductImageUrl,
    getResponsiveImageSource,
} from "../images";

describe("normalizeProductImageName", () => {
    it("strips a trailing .jpg", () => {
        expect(normalizeProductImageName("apple-iphone-13.jpg")).toBe("apple-iphone-13");
    });

    it("is case-insensitive on the .jpg suffix", () => {
        expect(normalizeProductImageName("APPLE-iPhone-13.JPG")).toBe("APPLE-iPhone-13");
    });

    it("returns empty string for null", () => {
        expect(normalizeProductImageName(null)).toBe("");
    });

    it("returns empty string for undefined", () => {
        expect(normalizeProductImageName(undefined)).toBe("");
    });

    it("leaves a name without .jpg unchanged", () => {
        expect(normalizeProductImageName("samsung-tv")).toBe("samsung-tv");
    });
});

describe("getProductImageUrl", () => {
    it("joins base URL with normalized name and .jpg suffix", () => {
        const url = getProductImageUrl("apple-iphone-13.jpg");
        expect(url).toBe(`${PRODUCT_IMAGE_BASE_URL}/apple-iphone-13.jpg`);
    });

    it("appends .jpg when missing", () => {
        expect(getProductImageUrl("samsung-tv")).toBe(`${PRODUCT_IMAGE_BASE_URL}/samsung-tv.jpg`);
    });

    it("returns empty string for null/undefined", () => {
        expect(getProductImageUrl(null)).toBe("");
        expect(getProductImageUrl(undefined)).toBe("");
    });
});

describe("getResponsiveImageSource", () => {
    it("returns an empty src when input is empty", () => {
        expect(getResponsiveImageSource("", { sizes: "100vw" })).toEqual({ src: "" });
    });

    it("preserves src and sizes in returned object", () => {
        const result = getResponsiveImageSource("/img.jpg", { sizes: "50vw" });
        expect(result.src).toBe("/img.jpg");
        expect(result.sizes).toBe("50vw");
    });
});
