import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ConfirmEmailChangePage from "./ConfirmEmailChangePage";

const mocks = vi.hoisted(() => ({
    confirmEmailChange: vi.fn(),
    setUserData: vi.fn(),
}));

vi.mock("../api", () => ({ confirmEmailChange: mocks.confirmEmailChange }));
vi.mock("../../../context/AuthContext", () => ({
    useAuth: () => ({ setUserData: mocks.setUserData }),
}));
vi.mock("react-helmet-async", () => ({ Helmet: () => null }));

describe("ConfirmEmailChangePage", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.confirmEmailChange.mockResolvedValue({
            userData: { id: "user-1", email: "new@example.com" },
        });
    });

    it("confirms the email-change token and updates the signed-in user", async () => {
        render(
            <MemoryRouter initialEntries={["/confirm-email-change?token=email-change-token"]}>
                <ConfirmEmailChangePage />
            </MemoryRouter>,
        );

        await waitFor(() => expect(mocks.confirmEmailChange).toHaveBeenCalledWith("email-change-token"));
        expect(mocks.setUserData).toHaveBeenCalledWith({ id: "user-1", email: "new@example.com" });
        expect(await screen.findByText("Your email was changed successfully.")).toBeInTheDocument();
    });
});
