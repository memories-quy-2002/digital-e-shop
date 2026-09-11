import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LoginPage from "./LoginPage";
import { Role, type UserData } from "../../../types/user";

const mocks = vi.hoisted(() => ({
    loginUser: vi.fn(),
    signInWithFirebaseEmail: vi.fn(),
    setUserData: vi.fn(),
    addToast: vi.fn(),
}));

vi.mock("../api", () => ({
    loginUser: mocks.loginUser,
}));

vi.mock("../../../context/AuthContext", () => ({
    useAuth: () => ({ userData: null, loading: false, setUserData: mocks.setUserData }),
}));

vi.mock("../../../context/ToastContext", () => ({
    useToast: () => ({ addToast: mocks.addToast }),
}));

vi.mock("../../../services/firebase", () => ({
    signInWithFirebaseEmail: mocks.signInWithFirebaseEmail,
}));

vi.mock("../../../utils/images", () => ({
    PAGE_IMAGE_WIDTHS: [],
    getResponsiveImageSource: () => ({ src: "test-image.jpg", srcSet: undefined, sizes: undefined }),
}));

const buildUser = (role: Role): NonNullable<UserData> => ({
    id: "user-1",
    email: "user@example.com",
    username: "user",
    first_name: "Test",
    last_name: "User",
    role,
    created_at: new Date("2026-01-01"),
    last_login: new Date("2026-01-01"),
});

const LocationProbe = () => {
    const location = useLocation();
    return <div data-testid="location">{location.pathname + location.search + location.hash}</div>;
};

const renderLogin = (redirect: string, role: Role) => {
    mocks.signInWithFirebaseEmail.mockResolvedValue({
        user: { getIdToken: vi.fn().mockResolvedValue("firebase-id-token") },
    });
    mocks.loginUser.mockResolvedValue(buildUser(role));
    render(
        <MemoryRouter initialEntries={["/login?redirect=" + encodeURIComponent(redirect)]}>
            <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route path="*" element={<LocationProbe />} />
            </Routes>
        </MemoryRouter>,
    );
};

const submitLogin = async () => {
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText("Email"), "user@example.com");
    await user.type(screen.getByPlaceholderText("Password"), "password");
    await user.click(screen.getByRole("button", { name: "Login" }));
};

describe("LoginPage return navigation", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("preserves a valid internal Admin redirect", async () => {
        renderLogin("/admin/orders?status=pending#detail", Role.Admin);
        await submitLogin();

        expect(await screen.findByTestId("location")).toHaveTextContent("/admin/orders?status=pending#detail");
    });

    it("rejects a malicious Admin redirect", async () => {
        renderLogin("/\\evil.com", Role.Admin);
        await submitLogin();

        expect(await screen.findByTestId("location")).toHaveTextContent("/admin");
    });

    it("always sends a Customer to the storefront", async () => {
        renderLogin("/admin/orders", Role.Customer);
        await submitLogin();

        expect(await screen.findByTestId("location")).toHaveTextContent("/");
    });
});
