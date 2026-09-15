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
    setFirebaseAuthPersistence: vi.fn(),
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
vi.mock("../../../services/firebasePersistence", () => ({
    setFirebaseAuthPersistence: mocks.setFirebaseAuthPersistence,
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
    await user.type(screen.getByRole("textbox", { name: "Email" }), "user@example.com");
    await user.type(screen.getByLabelText("Password"), "password");
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

    it("returns a Customer to the requested customer route", async () => {
        renderLogin("/account?tab=orders", Role.Customer);
        await submitLogin();

        expect(await screen.findByTestId("location")).toHaveTextContent("/account?tab=orders");
    });
});

describe("LoginPage Firebase errors", () => {
    it("renders the approved storefront shell", () => {
        render(
            <MemoryRouter initialEntries={["/login"]}>
                <Routes><Route path="/login" element={<LoginPage />} /></Routes>
            </MemoryRouter>,
        );

        expect(document.querySelector(".auth-shell")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Back to store" })).toHaveAttribute("href", "/");
        expect(screen.getByRole("button", { name: /color scheme:/i })).toBeInTheDocument();
        expect(screen.getByText("Your next build starts here.")).toBeInTheDocument();
        expect(document.querySelector(".login__image")).not.toBeInTheDocument();
    });

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("shows a meaningful semantic alert for invalid Firebase credentials", async () => {
        mocks.signInWithFirebaseEmail.mockRejectedValue({ code: "auth/invalid-credential" });

        render(
            <MemoryRouter initialEntries={["/login"]}>
                <Routes><Route path="/login" element={<LoginPage />} /></Routes>
            </MemoryRouter>,
        );

        const user = userEvent.setup();
        await user.type(screen.getByRole("textbox", { name: "Email" }), "buyer@example.com");
        await user.type(screen.getByLabelText("Password"), "WrongPassword1!");
        await user.click(screen.getByRole("button", { name: "Login" }));

        expect(await screen.findByRole("alert")).toHaveTextContent(
            "The email or password is incorrect. Check your credentials and try again.",
        );
        expect(screen.queryByText("An unexpected error occurred.")).not.toBeInTheDocument();
    });

    it("shows the app's email validation instead of relying on browser-native validation", async () => {
        render(
            <MemoryRouter initialEntries={["/login"]}>
                <Routes><Route path="/login" element={<LoginPage />} /></Routes>
            </MemoryRouter>,
        );

        const user = userEvent.setup();
        await user.type(screen.getByRole("textbox", { name: "Email" }), "not-an-email");
        await user.type(screen.getByLabelText("Password"), "password");
        await user.click(screen.getByRole("button", { name: "Login" }));

        expect(await screen.findByRole("alert")).toHaveTextContent("Enter a valid email address.");
        expect(mocks.signInWithFirebaseEmail).not.toHaveBeenCalled();
    });

    it("keeps the submit action available and focuses the first invalid field", async () => {
        render(
            <MemoryRouter initialEntries={["/login"]}>
                <Routes><Route path="/login" element={<LoginPage />} /></Routes>
            </MemoryRouter>,
        );

        const user = userEvent.setup();
        const submit = screen.getByRole("button", { name: "Login" });
        expect(submit).toBeEnabled();

        await user.click(submit);

        expect(await screen.findByText("Enter your email address.")).toBeInTheDocument();
        expect(screen.getByRole("textbox", { name: "Email" })).toHaveFocus();
    });

});
