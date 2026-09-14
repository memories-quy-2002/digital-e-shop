import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ForgotPasswordPage from "./ForgotPasswordPage";

const mocks = vi.hoisted(() => ({
    addToast: vi.fn(),
    sendFirebasePasswordReset: vi.fn(),
}));

vi.mock("../../../services/firebase", () => ({
    sendFirebasePasswordReset: mocks.sendFirebasePasswordReset,
}));
vi.mock("../../../context/ToastContext", () => ({
    useToast: () => ({ addToast: mocks.addToast }),
}));
vi.mock("react-helmet-async", () => ({ Helmet: () => null }));

describe("ForgotPasswordPage", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.sendFirebasePasswordReset.mockResolvedValue(undefined);
    });

    it("sends password reset through Firebase in the Firebase auth mode", async () => {
        render(
            <MemoryRouter>
                <ForgotPasswordPage />
            </MemoryRouter>,
        );

        fireEvent.change(screen.getByLabelText("Email"), {
            target: { value: "buyer@example.com" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));

        await waitFor(() => {
            expect(mocks.sendFirebasePasswordReset).toHaveBeenCalledWith("buyer@example.com");
        });
    });

    it("shows an accessible validation alert for an invalid email", async () => {
        render(
            <MemoryRouter>
                <ForgotPasswordPage />
            </MemoryRouter>,
        );

        fireEvent.change(screen.getByLabelText("Email"), {
            target: { value: "not-an-email" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));

        expect(await screen.findByRole("alert")).toHaveTextContent("Enter a valid email address.");
        expect(mocks.sendFirebasePasswordReset).not.toHaveBeenCalled();
    });

    it("distinguishes Firebase availability errors from unknown-account responses", async () => {
        mocks.sendFirebasePasswordReset.mockRejectedValue({ code: "auth/network-request-failed" });
        render(
            <MemoryRouter>
                <ForgotPasswordPage />
            </MemoryRouter>,
        );

        fireEvent.change(screen.getByLabelText("Email"), {
            target: { value: "buyer@example.com" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));

        expect(await screen.findByRole("alert")).toHaveTextContent(
            "We couldn't reach Firebase. Check your connection and try again.",
        );
    });

});
