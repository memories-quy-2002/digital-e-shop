import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ResetPasswordPage from "./ResetPasswordPage";

const mocks = vi.hoisted(() => ({
    confirmPasswordReset: vi.fn(),
    verifyFirebasePasswordResetCode: vi.fn(),
    confirmFirebasePasswordReset: vi.fn(),
}));

vi.mock("../api", () => ({ confirmPasswordReset: mocks.confirmPasswordReset }));
vi.mock("../../../services/firebase", () => ({
    verifyFirebasePasswordResetCode: mocks.verifyFirebasePasswordResetCode,
    confirmFirebasePasswordReset: mocks.confirmFirebasePasswordReset,
}));
vi.mock("react-helmet-async", () => ({ Helmet: () => null }));

describe("ResetPasswordPage", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.confirmPasswordReset.mockResolvedValue({});
        mocks.verifyFirebasePasswordResetCode.mockResolvedValue("buyer@example.com");
        mocks.confirmFirebasePasswordReset.mockResolvedValue(undefined);
    });

    it("confirms a local reset token and shows a success state", async () => {
        render(
            <MemoryRouter initialEntries={["/reset-password?token=local-token"]}>
                <ResetPasswordPage />
            </MemoryRouter>,
        );

        fireEvent.change(screen.getByLabelText("New password"), { target: { value: "NewPassword1!" } });
        fireEvent.change(screen.getByLabelText("Confirm new password"), { target: { value: "NewPassword1!" } });
        fireEvent.click(screen.getByRole("button", { name: "Reset password" }));

        await waitFor(() => expect(mocks.confirmPasswordReset).toHaveBeenCalledWith("local-token", "NewPassword1!"));
        expect(await screen.findByText("Your password has been reset successfully.")).toBeInTheDocument();
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
    });
});
