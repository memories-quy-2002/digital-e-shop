import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import AuthShell from "./AuthShell";

describe("AuthShell", () => {
    it("renders the approved storefront landmarks and theme control", () => {
        render(
            <MemoryRouter>
                <AuthShell
                    mode="login"
                    titleId="auth-title"
                    eyebrow="Customer account"
                    title="Welcome back"
                    description="Sign in to continue."
                    storyTitle="Your next build starts here."
                    storyDescription="Save your setups and track every order."
                    footer={<span>Footer content</span>}
                >
                    <div>Form content</div>
                </AuthShell>
            </MemoryRouter>,
        );

        expect(document.querySelector(".auth-shell")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Back to store" })).toHaveAttribute("href", "/");
        expect(screen.getByRole("button", { name: /color scheme:/i })).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "Welcome back" })).toHaveAttribute("id", "auth-title");
        expect(screen.getByText("Your next build starts here.")).toBeInTheDocument();
        expect(screen.getByText("Form content")).toBeInTheDocument();
        expect(screen.getByText("Footer content")).toBeInTheDocument();
    });
});
