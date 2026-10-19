import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import Footer from "./Footer";
vi.mock("../../hooks/useT", () => ({
    useT: () => (key: string) => key,
}));

describe("Footer", () => {
    it("does not render marketing subscription controls", () => {
        render(
            <MemoryRouter>
                <Footer />
            </MemoryRouter>,
        );

        expect(screen.queryByText("footer.newsletterTitle")).not.toBeInTheDocument();
        expect(screen.queryByLabelText("footer.newsletterEmailLabel")).not.toBeInTheDocument();
    });

    it("shows the three navigation groups without a payments column", () => {
        render(
            <MemoryRouter>
                <Footer />
            </MemoryRouter>,
        );

        expect(screen.getByRole("heading", { name: "footer.shop" })).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "footer.customerCare" })).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "footer.discover" })).toBeInTheDocument();
        expect(screen.queryByRole("heading", { name: "footer.payments" })).not.toBeInTheDocument();
        expect(screen.queryByText("cart.payos")).not.toBeInTheDocument();
        expect(screen.queryByText("footer.cashOnDelivery")).not.toBeInTheDocument();
    });
});
