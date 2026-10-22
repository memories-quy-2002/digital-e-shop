import { renderWithLocale } from "../../../test-utils/renderWithLocale";
// @vitest-environment jsdom

import { screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import ProductReviewLoginPrompt from "./ProductReviewLoginPrompt";

describe("ProductReviewLoginPrompt", () => {
    it("renders translated login copy and preserves the product route", () => {
        renderWithLocale(
            <MemoryRouter initialEntries={["/products/95?tab=reviews"]}>
                <ProductReviewLoginPrompt />
            </MemoryRouter>,
        );

        expect(screen.getByRole("link", { name: "Login" })).toHaveAttribute(
            "href",
            "/login?redirect=%2Fproducts%2F95%3Ftab%3Dreviews",
        );
        expect(screen.getByText(/to write a review and rate this product/)).toBeTruthy();
    });

    it("renders the Vietnamese translation without exposing a dictionary key", async () => {
        window.localStorage.setItem("digital-e:locale:v1", JSON.stringify("vi"));
        renderWithLocale(
            <MemoryRouter initialEntries={["/products/95"]}>
                <ProductReviewLoginPrompt />
            </MemoryRouter>,
        );

        expect(await screen.findByRole("link", { name: "Đăng nhập" })).toBeTruthy();
        expect(screen.getByText(/để viết đánh giá và chấm điểm sản phẩm này/)).toBeTruthy();
    });
});
