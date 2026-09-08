import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import ContactUsPage from "../ContactUsPage";
import { LocaleProvider } from "../../context/LocaleContext";

vi.mock("../../components/layout/Layout", () => ({
    default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("../../context/ToastContext", () => ({
    useToast: () => ({ addToast: vi.fn() }),
}));

vi.mock("react-helmet", () => ({
    Helmet: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe("ContactUsPage", () => {
    it("marks the submit action as the primary contact button", () => {
        render(
            <LocaleProvider>
                <MemoryRouter>
                    <ContactUsPage />
                </MemoryRouter>
            </LocaleProvider>,
        );

        expect(screen.getByRole("button")).toHaveClass("contact__form__button--primary");
        expect(screen.getByRole("link", { name: "Review orders" })).toHaveClass("contact__hero__action--ghost");
    });
});
