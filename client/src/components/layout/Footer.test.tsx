import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Footer from "./Footer";

const mocks = vi.hoisted(() => ({
    addToast: vi.fn(),
    subscribeToMarketing: vi.fn(),
}));

vi.mock("../../context/ToastContext", () => ({
    useToast: () => ({ addToast: mocks.addToast }),
}));
vi.mock("../../hooks/useT", () => ({
    useT: () => (key: string) => key,
}));
vi.mock("../../features/marketing/api", () => ({
    subscribeToMarketing: mocks.subscribeToMarketing,
}));

describe("Footer newsletter subscription", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.subscribeToMarketing.mockResolvedValue(undefined);
    });

    it("submits a valid email to the marketing subscription endpoint", async () => {
        render(
            <MemoryRouter>
                <Footer />
            </MemoryRouter>,
        );

        fireEvent.change(screen.getByLabelText("footer.newsletterEmailLabel"), {
            target: { value: "buyer@example.com" },
        });
        fireEvent.click(screen.getByRole("button", { name: "footer.subscribe" }));

        await waitFor(() => expect(mocks.subscribeToMarketing).toHaveBeenCalledWith("buyer@example.com"));
        expect(mocks.addToast).toHaveBeenCalledWith("footer.subscribe", "footer.subscribeSuccess");
    });
});
