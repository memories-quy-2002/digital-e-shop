import { describe, expect, it } from "vitest";
import { validateAddProduct } from "./validateAddProduct";

describe("validateAddProduct", () => {
    it("requires the server-required fields", () => {
        expect(
            validateAddProduct({
                name: "",
                category: "GPU",
                brand: "Example",
                price: 10,
                inventory: 2,
            }),
        ).toHaveProperty("name");
    });

    it("accepts zero price and inventory", () => {
        expect(
            validateAddProduct({
                name: "Card",
                category: "GPU",
                brand: "Example",
                price: 0,
                inventory: 0,
            }),
        ).toEqual({});
    });

    it("rejects negative price and fractional inventory", () => {
        expect(
            validateAddProduct({
                name: "Card",
                category: "",
                brand: "Example",
                price: -1,
                inventory: 1.5,
            }),
        ).toMatchObject({
            category: expect.any(String),
            price: expect.any(String),
            inventory: expect.any(String),
        });
    });
});

