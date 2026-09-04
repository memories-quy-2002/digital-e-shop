import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { resolveProductImagePath } from "../products.controller";

describe("resolveProductImagePath", () => {
    const uploadsDirectory = resolve("C:/digital-e-shop-test/uploads");

    it("resolves a product image basename below the upload directory", () => {
        expect(resolveProductImagePath("apple-iphone-13", uploadsDirectory)).toEqual({
            requestedFilename: "apple-iphone-13.jpg",
            imagePath: resolve(uploadsDirectory, "apple-iphone-13.jpg"),
        });
    });

    it.each(["../package", "..\\package", "nested/image", "C:\\Windows\\win.ini", ""])(
        "rejects a path-bearing or empty image name: %s",
        (filename) => {
            expect(resolveProductImagePath(filename, uploadsDirectory)).toBeNull();
        },
    );
});
