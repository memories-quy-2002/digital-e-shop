import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ResetPasswordPage from "./ResetPasswordPage";

const mocks = vi.hoisted(() => ({
    verifyFirebasePasswordResetCode: vi.fn(),
    confirmFirebasePasswordReset: vi.fn(),
}));

vi.mock("../../../services/firebase", () => ({
    verifyFirebasePasswordResetCode: mocks.verifyFirebasePasswordResetCode,
    confirmFirebasePasswordReset: mocks.confirmFirebasePasswordReset,
}));
vi.mock("react-helmet-async", () => ({ Helmet: () => null }));

describe("ResetPasswordPage", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.verifyFirebasePasswordResetCode.mockResolvedValue("buyer@example.com");
        mocks.confirmFirebasePasswordReset.mockResolvedValue(undefined);
    });

    it("uses Firebase action-code helpers for a Firebase reset link", async () => {
        render(
            <MemoryRouter initialEntries={["/reset-password?mode=resetPassword&oobCode=firebase-code"]}>
                <ResetPasswordPage />
            </MemoryRouter>,
        );

        expect(await screen.findByText(/buyer@example.com/)).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText("New password"), { target: { value: "NewPassword1!" } });
        fireEvent.change(screen.getByLabelText("Confirm new password"), { target: { value: "NewPassword1!" } });
        fireEvent.click(screen.getByRole("button", { name: "Reset password" }));

        await waitFor(() => expect(mocks.confirmFirebasePasswordReset).toHaveBeenCalledWith("firebase-code", "NewPassword1!"));
        expect(await screen.findByRole("heading", { name: "Password reset" })).toBeInTheDocument();
        expect(screen.getByText("Your password has been reset successfully.")).toBeInTheDocument();
    });

    it("keeps a meaningful Firebase action-code error on the reset page", async () => {
        mocks.confirmFirebasePasswordReset.mockRejectedValue({ code: "auth/expired-action-code" });

        render(
            <MemoryRouter initialEntries={["/reset-password?mode=resetPassword&oobCode=firebase-code"]}>
                <ResetPasswordPage />
            </MemoryRouter>,
        );

        expect(await screen.findByText(/buyer@example.com/)).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText("New password"), { target: { value: "NewPassword1!" } });
        fireEvent.change(screen.getByLabelText("Confirm new password"), { target: { value: "NewPassword1!" } });
        fireEvent.click(screen.getByRole("button", { name: "Reset password" }));

        expect(await screen.findByRole("alert")).toHaveTextContent(
            "This Firebase action link is invalid or expired. Request a new link and try again.",
        );
        expect(screen.getByRole("link", { name: "Back to login" })).toBeInTheDocument();
    });
});
