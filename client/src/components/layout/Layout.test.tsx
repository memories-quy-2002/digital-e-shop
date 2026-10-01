import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "../../context/LocaleContext";
import Layout from "./Layout";

vi.mock("./Header", () => ({
    Header: () => <header data-testid="site-header" />,
}));

vi.mock("./Footer", () => ({ default: () => <footer /> }));

vi.mock("../../features/products/components/ComparisonTray", () => ({
    default: () => null,
}));

describe("storefront layout accessibility", () => {
    beforeEach(() => {
        window.localStorage.clear();
    });

    it("puts a localized skip link before the shared header and targets the main landmark", () => {
        window.localStorage.setItem(
            "digital-e:locale:v1",
            JSON.stringify("vi"),
        );

        const { container } = render(
            <MemoryRouter>
                <LocaleProvider>
                    <Layout>
                        <h1>Trang sản phẩm</h1>
                    </Layout>
                </LocaleProvider>
            </MemoryRouter>,
        );

        const skipLink = screen.getByRole("link", {
            name: "Bỏ qua đến nội dung chính",
        });
        const main = screen.getByRole("main");

        expect(container.querySelector(".app-shell")?.firstElementChild).toBe(
            skipLink,
        );
        expect(skipLink).toHaveAttribute("href", "#main-content");
        expect(main).toHaveAttribute("id", "main-content");
        expect(main).toHaveAttribute("tabindex", "-1");
    });
});
