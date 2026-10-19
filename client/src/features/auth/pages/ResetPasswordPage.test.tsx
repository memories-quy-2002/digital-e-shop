import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ResetPasswordPage from "./ResetPasswordPage";
import { LocaleProvider } from "../../../context/LocaleContext";

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
        window.localStorage.removeItem("digital-e:locale:v1");
        mocks.verifyFirebasePasswordResetCode.mockResolvedValue("buyer@example.com");
        mocks.confirmFirebasePasswordReset.mockResolvedValue(undefined);
    });

    it("uses Firebase action-code helpers for a Firebase reset link", async () => {
        render(
            <LocaleProvider><MemoryRouter initialEntries={["/reset-password?mode=resetPassword&oobCode=firebase-code"]}>
                <ResetPasswordPage />
            </MemoryRouter></LocaleProvider>,
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
            <LocaleProvider><MemoryRouter initialEntries={["/reset-password?mode=resetPassword&oobCode=firebase-code"]}>
                <ResetPasswordPage />
            </MemoryRouter></LocaleProvider>,
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

    it("localizes the missing-link recovery state", () => {
        window.localStorage.setItem("digital-e:locale:v1", JSON.stringify("vi"));

        render(
            <LocaleProvider><MemoryRouter initialEntries={["/reset-password"]}>
                <ResetPasswordPage />
            </MemoryRouter></LocaleProvider>,
        );

        expect(screen.getByRole("heading", { name: "Chọn mật khẩu mới" })).toBeInTheDocument();
        expect(screen.getByRole("alert")).toHaveTextContent("Liên kết đặt lại mật khẩu thiếu mã thao tác Firebase.");
        expect(screen.getByRole("link", { name: "Quay lại đăng nhập" })).toBeInTheDocument();
    });
});
