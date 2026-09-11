import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SignupPage from "./SignupPage";

const mocks = vi.hoisted(() => ({
    createFirebaseUser: vi.fn(),
    signInWithFirebaseEmail: vi.fn(),
    sendFirebaseEmailVerification: vi.fn(),
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

        fireEvent.change(screen.getByPlaceholderText("Username"), { target: { value: "customer" } });
        fireEvent.change(screen.getByPlaceholderText("Email"), { target: { value: "customer@example.com" } });
        fireEvent.change(screen.getByPlaceholderText("Password"), { target: { value: "Password1!" } });
        fireEvent.change(screen.getByPlaceholderText("Confirm Password"), { target: { value: "Password1!" } });
        fireEvent.click(screen.getByRole("button", { name: "Sign up" }));

        await waitFor(() => expect(mocks.registerUser).toHaveBeenCalledWith({
            idToken: "firebase-id-token",
            user: { username: "customer" },
        }));
        expect(mocks.sendFirebaseEmailVerification).toHaveBeenCalledTimes(1);
    });
});
