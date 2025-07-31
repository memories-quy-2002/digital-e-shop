import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeAll, afterEach, Mock, Mocked } from "vitest";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter } from "react-router-dom";
import axios from "../api/axios";
import LoginPage from "../components/pages/LoginPage";
import { Role } from "../utils/interface";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../services/firebase";
import ToastProvider from "../context/ToastContext";

vi.mock("../api/axios");
vi.mock("firebase/auth", () => ({
    getAuth: vi.fn(),
    signInWithEmailAndPassword: vi.fn(),
}));

const mockSignInWithEmailAndPassword = signInWithEmailAndPassword as Mock;
const mockedAxios = vi.mocked(axios);
declare global {
    interface Performance {
        markResourceTiming: Mock;
    }
}

const handleOnSubmitMock = vi.fn();
describe("LoginPage", () => {
    const users = {
        customer: {
            email: "test1@gmail.com",
            password: "Phuquy2002@",
            role: Role.Customer,
        },
        admin: {
            email: "test2@gmail.com",
            password: "Phuquy2002@",
            role: Role.Admin,
        },
    };

    beforeAll(() => {
        global.performance.markResourceTiming = vi.fn();
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    const renderLoginPage = (user: typeof users.customer) => {
        render(
            <ToastProvider>
                <MemoryRouter initialEntries={["/login", "/", "/admin"]}>
                    <LoginPage />
                </MemoryRouter>
            </ToastProvider>
        );

        // Fill in email and password

        screen.getByRole("form", { name: "login-form" }).onsubmit = handleOnSubmitMock;
        fireEvent.change(screen.getByPlaceholderText(/email/i), {
            target: { value: user.email },
        });
        fireEvent.change(screen.getByPlaceholderText(/password/i), {
            target: { value: user.password },
        });

        // Select role (Customer or Admin)
        if (user.role === Role.Customer) {
            fireEvent.click(screen.getByLabelText("Customer"));
        } else if (user.role === Role.Admin) {
            fireEvent.click(screen.getByLabelText("Admin"));
        }
        fireEvent.click(screen.getByRole("button", { name: "Login" }));

        // Expectations for form submission
    };

    it("should match the LoginPage snapshot", async () => {
        const { asFragment } = render(
            <ToastProvider>
                <MemoryRouter>
                    <LoginPage />
                </MemoryRouter>
            </ToastProvider>
        );
        expect(asFragment()).toMatchSnapshot();
    });

    it("should handle successful customer login", async () => {
        // Mock axios response
        (mockedAxios.post as Mock).mockImplementationOnce(() =>
            Promise.resolve({
                status: 200,
                data: { token: "customerMockedToken" },
            })
        );
        mockSignInWithEmailAndPassword.mockResolvedValueOnce({
            user: { uid: "mockedUid" }, // Mock the user UID from Firebase
        });

        renderLoginPage(users.customer);
        expect(screen.getByText("Welcome back")).toBeInTheDocument();
        expect(handleOnSubmitMock).toHaveBeenCalled();

        await waitFor(() => {
            expect(signInWithEmailAndPassword).toHaveBeenCalledWith(
                auth,
                users.customer.email,
                users.customer.password
            );
        });
        await waitFor(() => {
            expect(mockedAxios.post).toHaveBeenCalledWith("/api/users/login", {
                uid: "mockedUid",
                role: Role.Customer,
            });
        });
    });

    it("should handle successful admin login", async () => {
        // Mock axios response
        (mockedAxios.post as Mock).mockImplementationOnce(() =>
            Promise.resolve({
                status: 200,
                data: { token: "adminMockedToken" },
            })
        );
        mockSignInWithEmailAndPassword.mockResolvedValueOnce({
            user: { uid: "mockedUid" }, // Mock the user UID from Firebase
        });

        renderLoginPage(users.admin);
        expect(screen.getByText("Welcome back")).toBeInTheDocument();
        expect(handleOnSubmitMock).toHaveBeenCalled();

        await waitFor(() => {
            expect(signInWithEmailAndPassword).toHaveBeenCalledWith(auth, users.admin.email, users.admin.password);
        });
        await waitFor(() => {
            expect(mockedAxios.post).toHaveBeenCalledWith("/api/users/login", {
                uid: "mockedUid",
                role: Role.Admin,
            });
        });
    });

    it("should handle login error", async () => {
        // Mock axios to return an error
        (mockedAxios.post as Mock).mockImplementationOnce(() =>
            Promise.reject({
                status: 401,
                data: { token: "adminMockedToken" },
            })
        );
        renderLoginPage({
            email: "test@example.com",
            password: "wrong_password",
            role: Role.Customer,
        });
        expect(screen.getByText("Welcome back")).toBeInTheDocument();
        // Check if the error message is shown
        await waitFor(() => {
            expect(
                screen.getByText(
                    /Password must be at least 8 characters long, contain at least one lowercase letter, one uppercase letter, one number, and one special character./i
                )
            ).toBeInTheDocument();
        });
    });

    it("should handle empty email", async () => {
        // Mock axios to return an error
        (mockedAxios.post as Mock).mockImplementationOnce(() =>
            Promise.reject({
                status: 401,
                data: { token: "adminMockedToken" },
            })
        );
        renderLoginPage({
            email: "",
            password: "wrong_password",
            role: Role.Customer,
        });
        expect(screen.getByText("Welcome back")).toBeInTheDocument();
        // Check if the error message is shown
        await waitFor(() => {
            expect(screen.getByText(/Email is required/i)).toBeInTheDocument();
        });
    });

    it("should handle invalid email", async () => {
        // Mock axios to return an error
        (mockedAxios.post as Mock).mockImplementationOnce(() =>
            Promise.reject({
                status: 401,
                data: { token: "adminMockedToken" },
            })
        );
        renderLoginPage({
            email: "12345678",
            password: "wrong_password",
            role: Role.Customer,
        });
        expect(screen.getByText("Welcome back")).toBeInTheDocument();
        // Check if the error message is shown
        await waitFor(() => {
            expect(screen.getByText(/Invalid email format/i)).toBeInTheDocument();
        });
    });

    it("should handle empty password", async () => {
        // Mock axios to return an error
        (mockedAxios.post as Mock).mockImplementationOnce(() =>
            Promise.reject({
                status: 401,
                data: { token: "adminMockedToken" },
            })
        );
        renderLoginPage({
            email: "test2@gmail.com",
            password: "",
            role: Role.Admin,
        });
        expect(screen.getByText("Welcome back")).toBeInTheDocument();
        // Check if the error message is shown
        await waitFor(() => {
            expect(screen.getByText(/Password is required/i)).toBeInTheDocument();
        });
    });
});
