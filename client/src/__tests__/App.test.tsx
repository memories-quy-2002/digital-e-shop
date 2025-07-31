import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { signOut } from "firebase/auth";
import { BrowserRouter, MemoryRouter } from "react-router-dom";
import type { Mock, Mocked } from "vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import axios from "../api/axios";
import AdminDashboard from "../components/pages/admin/AdminDashboard";
import HomePage from "../components/pages/HomePage";
import NoPage from "../components/pages/NoPage";
import ShopsPage from "../components/pages/ShopsPage";
import { useAuth } from "../context/AuthContext";
import ToastProvider from "../context/ToastContext";
import { auth } from "../services/firebase";
import { Role } from "../utils/interface";
vi.mock("../context/AuthContext");
vi.mock("../api/axios");
vi.mock("firebase/auth", () => ({
    getAuth: vi.fn(),
    signOut: vi.fn(),
}));

// Use Vitest's vi.Mock for type assertion
const mockUseAuth = useAuth as unknown as Mock;
const mockedAxios = axios as Mocked<typeof axios>;

describe("App", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockUseAuth.mockReturnValue({
            uid: "12345",
            userData: {
                id: "12345",
                username: "customer1",
                email: "johndoe@example.com",
                role: Role.Customer,
                created_at: new Date("2024-09-15"),
                last_login: new Date("2024-09-15"),
            },
            loading: false,
        });
    });

    it("matches the App snapshot", () => {
        const { asFragment } = render(
            <ToastProvider>
                <BrowserRouter>
                    <HomePage />
                </BrowserRouter>
            </ToastProvider>
        );
        expect(asFragment()).toMatchSnapshot();
    });

    it("renders HomePage component on default route", async () => {
        render(
            <ToastProvider>
                <BrowserRouter>
                    <HomePage />
                </BrowserRouter>
            </ToastProvider>
        );

        await waitFor(() => {
            expect(screen.getByText(/Explore Our Latest Devices/i)).toBeInTheDocument();
        });
    });

    it("should display NotFoundPage for an invalid route", async () => {
        render(
            <MemoryRouter initialEntries={["/invalid-route"]}>
                <NoPage />
            </MemoryRouter>
        );

        await waitFor(() => {
            expect(screen.getByText(/404 Error/i)).toBeInTheDocument();
        });
    });

    it("redirects unauthenticated user from protected routes", () => {
        render(
            <ToastProvider>
                <BrowserRouter>
                    <AdminDashboard />
                </BrowserRouter>
            </ToastProvider>
        );

        const link = screen.getAllByText(/Dashboard/i)[0] as HTMLAnchorElement;
        expect(link).toBeInTheDocument();
        expect(screen.getByText(/Download Report/i)).toBeInTheDocument();
        expect(screen.queryByText(/Login/i)).not.toBeInTheDocument();
    });

    it("should navigate between pages correctly", async () => {
        render(
            <ToastProvider>
                <MemoryRouter initialEntries={["/", "/shops"]}>
                    <HomePage />
                    <ShopsPage />
                </MemoryRouter>
            </ToastProvider>
        );

        await waitFor(() => {
            expect(screen.getByText(/Explore Our Latest Devices/i)).toBeInTheDocument();
        });

        const viewAllLink = screen.getByRole("link", { name: /View all/i });
        expect(viewAllLink).toBeInTheDocument();
        expect(viewAllLink).toHaveAttribute("href", "/shops");

        fireEvent.click(viewAllLink);

        await waitFor(() => {
            expect(screen.getByText(/SHOPS PRODUCTS/i)).toBeInTheDocument();
        });
    });

    it("should logout successfully", async () => {
        vi.stubGlobal("location", {
            reload: vi.fn(),
        });

        const reloadFn = () => {
            window.location.reload();
        };

        mockedAxios.post.mockImplementationOnce(() => {
            return Promise.resolve({
                status: 200,
                data: {
                    userData: {
                        id: "12345",
                        username: "customer1",
                        email: "johndoe@example.com",
                        role: Role.Customer,
                        created_at: new Date("2024-09-15"),
                        last_login: new Date("2024-09-15"),
                    },
                    msg: "User logged out successfully",
                },
            });
        });

        render(
            <ToastProvider>
                <MemoryRouter>
                    <HomePage />
                </MemoryRouter>
            </ToastProvider>
        );

        await waitFor(() => {
            expect(screen.getByText(/customer1/i)).toBeInTheDocument();
        });

        const logoutButton = screen.getByRole("link", { name: /logout/i });
        fireEvent.click(logoutButton);

        mockUseAuth.mockReturnValue({
            uid: null,
            userData: null,
            loading: false,
        });

        await waitFor(() => {
            expect(mockedAxios.post).toHaveBeenCalledWith("/api/users/logout");
        });

        expect(signOut).toHaveBeenCalledWith(auth);

        reloadFn();
        expect(window.location.reload).toHaveBeenCalled();
    });
});
