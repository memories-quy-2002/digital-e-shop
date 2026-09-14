import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import withSessionCheck from "./withSessionCheck";
import type { UserData } from "../../../types/user";
import { Role } from "../../../types/user";

const mocks = vi.hoisted(() => ({
    auth: { currentUser: null as unknown },
    getFirebaseAuth: vi.fn(),
    httpGet: vi.fn(),
    addToast: vi.fn(),
    useAuth: vi.fn(),
}));

vi.mock("../../../context/AuthContext", () => ({
    useAuth: mocks.useAuth,
}));

vi.mock("../../../services/firebase", () => ({
    getFirebaseAuth: mocks.getFirebaseAuth,
}));

vi.mock("../../../lib/http", () => ({
    default: { get: mocks.httpGet },
}));

vi.mock("../../../context/ToastContext", () => ({
    useToast: () => ({ addToast: mocks.addToast }),
}));

vi.mock("../../../components/common/LoadingScreen", () => ({
    default: () => <div role="status">Loading account</div>,
}));

const buildUser = (): NonNullable<UserData> => ({
    id: "user-1",
    email: "user@example.com",
    username: "user",
    first_name: "Test",
    last_name: "User",
    role: Role.Customer,
    created_at: new Date("2026-01-01"),
    last_login: new Date("2026-01-01"),
});

const LocationProbe = () => {
    const location = useLocation();
    return <div data-testid="location">{location.pathname + location.search + location.hash}</div>;
};

const ProtectedAccount = withSessionCheck(() => <div data-testid="protected-account">Account</div>);

const renderGuard = (auth: { loading: boolean; userData: UserData }, initialEntry = "/account") => {
    mocks.useAuth.mockReturnValue({ ...auth, setUserData: vi.fn() });
    return render(
        <MemoryRouter initialEntries={[initialEntry]}>
            <Routes>
                <Route path="/account" element={<ProtectedAccount />} />
                <Route path="/login" element={<LocationProbe />} />
            </Routes>
        </MemoryRouter>,
    );
};

describe("withSessionCheck", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.auth.currentUser = null;
        mocks.getFirebaseAuth.mockResolvedValue(mocks.auth);
        mocks.httpGet.mockResolvedValue({ status: 200 });
    });

    it("redirects anonymous users to login with the protected route as return target", () => {
        renderGuard({ loading: false, userData: null }, "/account?tab=orders#recent");

        expect(screen.getByTestId("location")).toHaveTextContent(
            "/login?redirect=%2Faccount%3Ftab%3Dorders%23recent",
        );
        expect(screen.queryByTestId("protected-account")).not.toBeInTheDocument();
    });

    it("keeps the protected page hidden while the server session resolves", () => {
        renderGuard({ loading: true, userData: null });

        expect(screen.getByRole("status")).toHaveTextContent("Loading account");
        expect(screen.queryByTestId("protected-account")).not.toBeInTheDocument();
    });

    it("renders the protected page for an authenticated customer", async () => {
        mocks.auth.currentUser = { uid: "firebase-user" };
        renderGuard({ loading: false, userData: buildUser() });

        expect(screen.getByTestId("protected-account")).toBeInTheDocument();
        await vi.waitFor(() => expect(mocks.httpGet).toHaveBeenCalledWith("/api/users/session/check"));
    });
});
