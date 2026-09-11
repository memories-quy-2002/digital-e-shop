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
    });
});
