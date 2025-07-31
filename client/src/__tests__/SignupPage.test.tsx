import { vi, describe, it, expect, beforeEach, afterEach, Mock } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { MemoryRouter } from "react-router-dom";
import axios from "../api/axios";
import SignupPage from "../components/pages/SignupPage";
import { auth } from "../services/firebase";
import { Role } from "../utils/interface";
vi.mock("firebase/auth", () => ({
    getAuth: vi.fn(),
    createUserWithEmailAndPassword: vi.fn(),
}));
vi.mock("../api/axios");

const mockedAxios = vi.mocked(axios);
declare global {
    interface Performance {
        markResourceTiming: Mock;
    }
}

const handleOnSubmitMock = vi.fn();
describe("SignupPage", () => {
    const users = {
        customer: {
            username: "customer123",
            email: "test6@gmail.com",
            password: "Memories2002@",
            confirm: "Memories2002@",
            role: Role.Customer,
        },
        admin: {
            username: "admin123",
            email: "test7@gmail.com",
            password: "Memories2002@",
            confirm: "Memories2002@",
            role: Role.Admin,
        },
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    const renderSignupPage = (user: typeof users.customer) => {
        render(
            <MemoryRouter>
                <SignupPage />
            </MemoryRouter>
        );

        // Fill in email and password

        screen.getByRole("form", { name: "signup-form" }).onsubmit = handleOnSubmitMock;
        fireEvent.change(screen.getByPlaceholderText("Username"), {
            target: { value: user.username },
        });
        fireEvent.change(screen.getByPlaceholderText("Email"), {
            target: { value: user.email },
        });
        fireEvent.change(screen.getByPlaceholderText("Password"), {
            target: { value: user.password },
        });

        fireEvent.change(screen.getByPlaceholderText("Confirm Password"), {
            target: { value: user.confirm },
        });

        // Select role (Customer or Admin)
        if (user.role === Role.Customer) {
            const customerRadio = screen.getByLabelText("Customer");
            fireEvent.click(customerRadio);
            expect(customerRadio).toBeChecked();
        } else if (user.role === Role.Admin) {
            const adminRadio = screen.getByLabelText("Admin");
            fireEvent.click(adminRadio);
            expect(adminRadio).toBeChecked();
        }
        fireEvent.click(screen.getByRole("button", { name: "Sign up" }));
    };

    it("should match the SignupPage snapshot", async () => {
        const { asFragment } = render(
            <MemoryRouter>
                <SignupPage />
            </MemoryRouter>
        );
        expect(asFragment()).toMatchSnapshot();
    });

    it("should handle successful customer signup", async () => {
        (createUserWithEmailAndPassword as Mock).mockResolvedValue({
            user: { uid: "mock-user-id" },
        });
        // Mock axios response
        (mockedAxios.post as Mock).mockImplementationOnce(() =>
            Promise.resolve({
                status: 200,
                data: { token: "customerMockedToken" },
            })
        );

        renderSignupPage(users.customer);
        expect(screen.getByText("Create new account")).toBeInTheDocument();
        expect(handleOnSubmitMock).toHaveBeenCalled();
        await waitFor(() => {
            expect(createUserWithEmailAndPassword).toHaveBeenCalledWith(
                auth,
                users.customer.email,
                users.customer.password
            );
        });

        // Wait for the axios post call
        await waitFor(() => {
            expect(mockedAxios.post).toHaveBeenCalledWith("/api/users", {
                user: users.customer,
                uid: "mock-user-id",
            });
        });
    });

    it("should handle successful admin signup", async () => {
        // Mock axios response
        (createUserWithEmailAndPassword as Mock).mockResolvedValue({
            user: { uid: "mock-user-id" },
        });
        (mockedAxios.post as Mock).mockImplementationOnce(() =>
            Promise.resolve({
                status: 200,
                data: { token: "adminMockedToken" },
            })
        );

        renderSignupPage(users.admin);

        expect(screen.getByText("Create new account")).toBeInTheDocument();
        expect(handleOnSubmitMock).toHaveBeenCalled();
        await waitFor(() => {
            expect(createUserWithEmailAndPassword).toHaveBeenCalledWith(auth, users.admin.email, users.admin.password);
        });
        // Wait for the axios post call
        await waitFor(() => {
            expect(mockedAxios.post).toHaveBeenCalledWith("/api/users", {
                user: users.admin,
                uid: "mock-user-id",
            });
        });
    });

    it("should handle signup error", async () => {
        // Mock axios to return an error
        (mockedAxios.post as Mock).mockImplementationOnce(() =>
            Promise.reject({
                status: 401,
                data: { token: "customerMockedToken" },
            })
        );
        renderSignupPage({
            username: "customer123",
            email: "test@example.com",
            password: "wrong_password",
            confirm: "wrong_password",
            role: Role.Customer,
        });
        expect(screen.getByText("Create new account")).toBeInTheDocument();
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
                data: { token: "customerMockedToken" },
            })
        );
        renderSignupPage({
            username: "customer123",
            email: "",
            password: "wrong_password",
            confirm: "wrong_password",
            role: Role.Customer,
        });
        expect(screen.getByText("Create new account")).toBeInTheDocument();
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
                data: { token: "customerMockedToken" },
            })
        );
        renderSignupPage({
            username: "customer123",
            email: "test1@",
            password: "wrong_password",
            confirm: "wrong_password",
            role: Role.Customer,
        });
        expect(screen.getByText("Create new account")).toBeInTheDocument();
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

        renderSignupPage({
            username: "admin123",
            email: "test@gmail.com",
            password: "",
            confirm: "",
            role: Role.Admin,
        });
        expect(screen.getByText("Create new account")).toBeInTheDocument();
        // Check if the error message is shown
        await waitFor(() => {
            expect(screen.getByText(/Password is required/i)).toBeInTheDocument();
        });
    });
});
