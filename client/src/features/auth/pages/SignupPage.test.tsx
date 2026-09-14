import userEvent from "@testing-library/user-event";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SignupPage from "./SignupPage";

const mocks = vi.hoisted(() => ({
    createFirebaseUser: vi.fn(),
    signInWithFirebaseEmail: vi.fn(),
    sendFirebaseEmailVerification: vi.fn(),
    setFirebaseAuthPersistence: vi.fn(),
    registerUser: vi.fn(),
    setUserData: vi.fn(),
    addToast: vi.fn(),
}));

vi.mock("../api", () => ({ registerUser: mocks.registerUser }));
vi.mock("../../../services/firebase", () => ({
    createFirebaseUser: mocks.createFirebaseUser,
    signInWithFirebaseEmail: mocks.signInWithFirebaseEmail,
    sendFirebaseEmailVerification: mocks.sendFirebaseEmailVerification,
}));
vi.mock("../../../services/firebasePersistence", () => ({
    setFirebaseAuthPersistence: mocks.setFirebaseAuthPersistence,
}));
vi.mock("../../../context/AuthContext", () => ({
    useAuth: () => ({ userData: null, loading: false, setUserData: mocks.setUserData }),
}));
vi.mock("../../../context/ToastContext", () => ({ useToast: () => ({ addToast: mocks.addToast }) }));
vi.mock("../../../utils/images", () => ({
    PAGE_IMAGE_WIDTHS: [],
    getResponsiveImageSource: () => ({ src: "test-image.jpg", srcSet: undefined, sizes: undefined }),
}));

describe("SignupPage Firebase verification", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.createFirebaseUser.mockResolvedValue({
            user: { emailVerified: false, getIdToken: vi.fn().mockResolvedValue("firebase-id-token") },
        });
        mocks.registerUser.mockResolvedValue({
            userData: { id: "firebase-uid", email: "customer@example.com", email_verified: false },
        });
        mocks.sendFirebaseEmailVerification.mockResolvedValue(undefined);
    });

    it("sends Firebase verification after the server accepts a new Firebase account", async () => {
        render(
            <MemoryRouter initialEntries={["/signup"]}>
                <Routes><Route path="/signup" element={<SignupPage />} /></Routes>
            </MemoryRouter>,
        );

        fireEvent.change(screen.getByRole("textbox", { name: "Username" }), { target: { value: "customer" } });
        fireEvent.change(screen.getByRole("textbox", { name: "Email address" }), { target: { value: "customer@example.com" } });
        fireEvent.change(screen.getByLabelText("Password"), { target: { value: "Password1!" } });
        fireEvent.change(screen.getByLabelText("Confirm Password"), { target: { value: "Password1!" } });
        fireEvent.click(screen.getByRole("button", { name: "Sign up" }));

        await waitFor(() => expect(mocks.registerUser).toHaveBeenCalledWith({
            idToken: "firebase-id-token",
            user: { username: "customer" },
        }));
        expect(mocks.sendFirebaseEmailVerification).toHaveBeenCalledTimes(1);
    });

    it("keeps the submit action available and focuses the first invalid field", async () => {
        render(
            <MemoryRouter initialEntries={["/signup"]}>
                <Routes><Route path="/signup" element={<SignupPage />} /></Routes>
            </MemoryRouter>,
        );

        const user = userEvent.setup();
        const submit = screen.getByRole("button", { name: "Sign up" });
        expect(submit).toBeEnabled();

        await user.click(submit);

        expect(await screen.findByText("Enter a username.")).toBeInTheDocument();
        expect(screen.getByRole("textbox", { name: "Username" })).toHaveFocus();
    });

    it("reports a mismatched confirmation even when the password is invalid", async () => {
        const user = userEvent.setup();
        render(
            <MemoryRouter initialEntries={["/signup"]}>
                <Routes><Route path="/signup" element={<SignupPage />} /></Routes>
            </MemoryRouter>,
        );

        await user.type(screen.getByRole("textbox", { name: "Username" }), "customer");
        await user.type(screen.getByRole("textbox", { name: "Email address" }), "customer@example.com");
        await user.type(screen.getByLabelText("Password"), "short");
        await user.type(screen.getByLabelText("Confirm Password"), "different");
        await user.click(screen.getByRole("button", { name: "Sign up" }));

        expect(await screen.findByText("Passwords do not match.")).toBeInTheDocument();
        expect(mocks.createFirebaseUser).not.toHaveBeenCalled();
    });

    it("explains the password requirements and marks auth inputs as non-spellchecked", () => {
        render(
            <MemoryRouter initialEntries={["/signup"]}>
                <Routes><Route path="/signup" element={<SignupPage />} /></Routes>
            </MemoryRouter>,
        );

        expect(screen.getByText(/8\+ characters/i)).toBeInTheDocument();
        expect(screen.getByRole("textbox", { name: "Username" })).toHaveAttribute("spellcheck", "false");
        expect(screen.getByRole("textbox", { name: "Email address" })).toHaveAttribute("spellcheck", "false");
    });

    it("preloads the critical auth image with intrinsic dimensions", () => {
        render(
            <MemoryRouter initialEntries={["/signup"]}>
                <Routes><Route path="/signup" element={<SignupPage />} /></Routes>
            </MemoryRouter>,
        );

        const image = document.querySelector(".signup__image img");
        expect(image).toHaveAttribute("loading", "eager");
        expect(image).toHaveAttribute("width", "1280");
        expect(image).toHaveAttribute("height", "853");
    });
});
