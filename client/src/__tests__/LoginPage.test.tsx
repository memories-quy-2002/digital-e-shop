import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import axios from "../api/axios"; // Import your custom Axios instance
import LoginPage from "../components/pages/LoginPage"; // Adjust based on your project structure
import { Role } from "../utils/interface";

// Mock Axios
jest.mock("../api/axios");

// Now `axios.post` will be of type `jest.Mock`
const mockedAxios = axios as jest.Mocked<typeof axios>;
declare global {
    interface Performance {
        markResourceTiming: jest.Mock<void, []>;
    }
}
const handleOnSubmitMock = jest.fn();
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
        global.performance.markResourceTiming = jest.fn();
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    const renderLoginPage = (user: typeof users.customer) => {
        render(
            <MemoryRouter initialEntries={["/login", "/", "/admin"]}>
                <LoginPage />
            </MemoryRouter>
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

    it("matches the LoginPage snapshot", async () => {
        const { asFragment } = render(
            <MemoryRouter>
                <LoginPage />
            </MemoryRouter>
        );
        expect(asFragment()).toMatchSnapshot();
    });

    it("handles successful customer login", async () => {
        // Mock axios response
        mockedAxios.post.mockImplementationOnce(() =>
            Promise.resolve({
                status: 200,
                data: { token: "customerMockedToken" },
            })
        );

        renderLoginPage(users.customer);
        expect(screen.getByText("Welcome back")).toBeInTheDocument();
        expect(handleOnSubmitMock).toHaveBeenCalled();
        await waitFor(() => {
            expect(mockedAxios.post).toHaveBeenCalledWith("/api/users/login", {
                uid: expect.any(String),
                role: Role.Customer,
            });
        });
    });

    it("handles successful admin login", async () => {
        // Mock axios response
        mockedAxios.post.mockImplementationOnce(() =>
            Promise.resolve({
                status: 200,
                data: { token: "adminMockedToken" },
            })
        );

        renderLoginPage(users.admin);

        expect(screen.getByText("Welcome back")).toBeInTheDocument();
        expect(handleOnSubmitMock).toHaveBeenCalled();

        // Wait for the axios post call
        await waitFor(() => {
            expect(mockedAxios.post).toHaveBeenCalledTimes(1);
        });
        await waitFor(() => {
            expect(mockedAxios.post).toHaveBeenCalledWith("/api/users/login", {
                uid: expect.any(String),
                role: Role.Admin,
            });
        });
    });

    it("handles login error", async () => {
        // Mock axios to return an error
        mockedAxios.post.mockImplementationOnce(() =>
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

    it("handle empty email", async () => {
        // Mock axios to return an error
        mockedAxios.post.mockImplementationOnce(() =>
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

    it("handles invalid email", async () => {
        // Mock axios to return an error
        mockedAxios.post.mockImplementationOnce(() =>
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

    it("handles empty password", async () => {
        // Mock axios to return an error
        mockedAxios.post.mockImplementationOnce(() =>
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
