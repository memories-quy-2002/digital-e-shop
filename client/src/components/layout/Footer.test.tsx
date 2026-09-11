import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Footer from "./Footer";

const mocks = vi.hoisted(() => ({
    addToast: vi.fn(),
}));

vi.mock("../../context/ToastContext", () => ({
    useToast: () => ({ addToast: mocks.addToast }),
}));
vi.mock("../../hooks/useT", () => ({
    useT: () => (key: string) => key,
}));
describe("Footer", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("does not render marketing subscription controls", () => {
        render(
            <MemoryRouter>
                <Footer />
            </MemoryRouter>,
        );

        expect(screen.queryByText("footer.newsletterTitle")).not.toBeInTheDocument();
        expect(screen.queryByLabelText("footer.newsletterEmailLabel")).not.toBeInTheDocument();
    });
});
