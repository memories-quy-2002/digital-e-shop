import { describe, expect, it, vi } from "vitest";
import { resolve } from "node:path";
import { GUARDS_METADATA, MODULE_METADATA } from "@nestjs/common/constants";
import { AuthGuard } from "../../guards/auth.guard";
import { OWNER_PARAM_KEY, RolesGuard } from "../../guards/roles.guard";
vi.mock("../../guards/auth.guard", () => ({ AuthGuard: class MockAuthGuard {} }));
vi.mock("../products.service", () => ({ NestProductsService: class {} }));
vi.mock("../products.repository", () => ({ NestProductsRepository: class {} }));
import { ProductsController, resolveProductImagePath } from "../products.controller";
import { ProductsModule } from "../products.module";

describe("product recommendations access", () => {
    it("registers route guards with the module dependency injector", () => {
        const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, ProductsModule) as unknown[];

        expect(providers).toContain(AuthGuard);
        expect(providers).toContain(RolesGuard);
    });

    it("requires an authenticated owner for user-personalized results", () => {
        const handler = ProductsController.prototype.getRecommendations;

        expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toEqual([AuthGuard, RolesGuard]);
        expect(Reflect.getMetadata(OWNER_PARAM_KEY, handler)).toBe("uid");
    });
});

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
