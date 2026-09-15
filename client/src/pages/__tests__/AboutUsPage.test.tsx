import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import AboutUsPage from "../AboutUsPage";
import { LocaleProvider } from "../../context/LocaleContext";

vi.mock("../../components/layout/Layout", () => ({
    default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("react-helmet-async", () => ({
    Helmet: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe("AboutUsPage", () => {
    it("renders the refreshed customer journey copy and localized stat value", () => {
        render(
            <LocaleProvider>
                <MemoryRouter>
                    <AboutUsPage />
                </MemoryRouter>
            </LocaleProvider>,
        );

        expect(screen.getByRole("heading", { name: "About Digital-E" })).toBeVisible();
        expect(screen.getByRole("heading", { name: "From discovery to delivery" })).toBeVisible();
        expect(screen.getByText("01", { selector: "small" })).toBeVisible();
        expect(screen.getByText("Clear", { selector: "strong" })).toBeVisible();
        expect(screen.getByRole("link", { name: "Contact support" })).toHaveAttribute("href", "/support");
    });
});
