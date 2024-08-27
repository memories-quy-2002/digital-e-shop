import React from "react";
import { render, fireEvent, waitFor, screen } from "@testing-library/react";
import LoginPage from "../components/pages/LoginPage";
import { signInWithEmailAndPassword } from "firebase/auth";

jest.mock("firebase/auth", () => ({
    getAuth: jest.fn(() => ({})),
    signInWithEmailAndPassword: jest.fn(),
}));

jest.mock("../api/axios.ts", () => ({
    post: jest.fn(),
}));

describe("LoginPage", () => {
    const setup = () => {
        const { asFragment } = render(<LoginPage />);
        const emailInput = screen.getByPlaceholderText("Email");
        const passwordInput = screen.getByPlaceholderText("Password");
        const loginButton = screen.getByText("Login");
        return { asFragment, screen, emailInput, passwordInput, loginButton };
    };

    it.only("renders correctly", () => {
        const { asFragment } = setup();
        expect(asFragment).toMatchSnapshot();
    });

    it("calls signInWithEmailAndPassword on submit", async () => {
        const { emailInput, passwordInput, loginButton } = setup();
        fireEvent.change(emailInput, { target: { value: "test@example.com" } });
        fireEvent.change(passwordInput, { target: { value: "password123" } });
        fireEvent.click(loginButton);
        await waitFor(() =>
            expect(signInWithEmailAndPassword).toHaveBeenCalledTimes(1)
        );
        expect(signInWithEmailAndPassword).toHaveBeenCalledWith(
            expect.any(Object), // auth instance
            "test@example.com",
            "password123"
        );
    });

    it("displays error message on invalid email", async () => {
        const { emailInput, loginButton } = setup();
        fireEvent.change(emailInput, { target: { value: "invalid-email" } });
        fireEvent.click(loginButton);
        await screen.findByText("Invalid email format");
    });

    it("displays error message on invalid password", async () => {
        const { passwordInput, loginButton } = setup();
        fireEvent.change(passwordInput, {
            target: { value: "short-password" },
        });
        fireEvent.click(loginButton);
        await screen.findByText(
            "Password must be at least 8 characters long, contain at least one lowercase letter, one uppercase letter, one number, and one special character."
        );
    });
});
