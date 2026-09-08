import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import RequireAdmin from "./RequireAdmin";
import { Role, type UserData } from "../../../types/user";

vi.mock("../../../context/AuthContext", () => ({
    useAuth: vi.fn(),
}));

vi.mock("../../../components/common/LoadingScreen", () => ({
    default: () => <div>Loading</div>,
}));

import { useAuth } from "../../../context/AuthContext";

const mockedUseAuth = vi.mocked(useAuth);

const buildUser = (overrides: Partial<NonNullable<UserData>> = {}): NonNullable<UserData> => ({
    id: "user-1",
    email: "user@example.com",
    username: "user",
    first_name: "Test",
    last_name: "User",
    role: Role.Admin,
    created_at: new Date("2026-01-01"),
    last_login: new Date("2026-01-01"),
    ...overrides,
});

const Location = () => {
    const location = useLocation();
    return <div data-testid="location">{location.pathname + location.search}</div>;
};

const renderWithAuth = (
    auth: { loading: boolean; userData: UserData },
    initialEntries = ["/admin"],
) => {
    mockedUseAuth.mockReturnValue({ ...auth, setUserData: vi.fn() });

    return render(
        <MemoryRouter initialEntries={initialEntries}>
            <Routes>
                <Route
                    path="/admin/*"
                    element={
                        <RequireAdmin>
                            <div data-testid="admin-child">Admin content</div>
                        </RequireAdmin>
                    }
                />
                <Route path="/login" element={null} />
                <Route path="/403" element={null} />
            </Routes>
            <Location />
        </MemoryRouter>,
    );
};

describe("RequireAdmin", () => {
    it("shows the page loading state while auth is resolving", () => {
        renderWithAuth({ loading: true, userData: null });
        expect(screen.getByText(/loading/i)).toBeInTheDocument();
    });

    it("redirects anonymous users to login with the current internal route", () => {
        renderWithAuth({ loading: false, userData: null }, ["/admin/orders?status=pending"]);
        expect(screen.getByTestId("location")).toHaveTextContent(
            "/login?redirect=%2Fadmin%2Forders%3Fstatus%3Dpending",
        );
    });

    it("redirects customers to the forbidden page", () => {
        renderWithAuth({ loading: false, userData: buildUser({ role: Role.Customer }) });
        expect(screen.getByTestId("location")).toHaveTextContent("/403");
    });

    it("renders Admin children for an Admin user", () => {
        renderWithAuth({ loading: false, userData: buildUser({ role: Role.Admin }) });
        expect(screen.getByTestId("admin-child")).toBeInTheDocument();
    });
});
