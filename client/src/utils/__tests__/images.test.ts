import { describe, expect, it } from "vitest";

import { getProductImageUrl, normalizeProductImageName } from "../images";

describe("product image utilities", () => {
    it("normalizes optional image filenames", () => {
        expect(normalizeProductImageName("keyboard.jpg")).toBe("keyboard");
        expect(normalizeProductImageName("KEYBOARD.JPG")).toBe("KEYBOARD");
        expect(normalizeProductImageName("keyboard.png")).toBe("keyboard.png");
        expect(normalizeProductImageName(null)).toBe("");
    });

    it("builds product image URLs from normalized names", () => {
        expect(getProductImageUrl("keyboard.jpg")).toBe(
            "https://2txtqipejre57csy.public.blob.vercel-storage.com/uploads/keyboard.jpg",
        );
        expect(getProductImageUrl("")).toBe("");
    });
});
