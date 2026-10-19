import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import ForbiddenPage from "../ForbiddenPage";
import { LocaleProvider } from "../../context/LocaleContext";

vi.mock("../../components/layout/Layout", () => ({
    default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("react-helmet-async", () => ({
    Helmet: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe("ForbiddenPage", () => {
    it.each([
        ["en", "Access denied", "Go to home"],
        ["vi", "Không có quyền truy cập", "Về trang chủ"],
    ] as const)("localizes recovery actions in %s", (locale, title, homeAction) => {
        localStorage.setItem("digital-e:locale:v1", JSON.stringify(locale));
        render(
            <LocaleProvider>
                <MemoryRouter>
                    <ForbiddenPage />
                </MemoryRouter>
            </LocaleProvider>,
        );

        expect(screen.getByRole("heading", { name: title })).toBeVisible();
        expect(screen.getByRole("link", { name: homeAction })).toHaveAttribute("href", "/");
        expect(screen.getByRole("link", { name: locale === "en" ? "Go to account" : "Đến trang tài khoản" })).toHaveAttribute("href", "/account");
    });
});
