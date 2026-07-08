import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import React from "react";
import { AuthProvider, useAuth } from "../AuthContext";
import { Role } from "../../utils/interface";

vi.mock("../../api/axios", () => ({
    default: {
        get: vi.fn(),
    },
}));

import axios from "../../api/axios";
const mockedAxios = axios as unknown as { get: ReturnType<typeof vi.fn> };

const Probe: React.FC = () => {
    const { userData, loading, setUserData } = useAuth();
    return (
        <div>
            <span data-testid="loading">{String(loading)}</span>
            <span data-testid="user">{userData ? userData.email : "anonymous"}</span>
            <button onClick={() => setUserData(null)}>clear</button>
        </div>
    );
};

const buildUser = (overrides: Partial<{ email: string; username: string; role: Role }> = {}) => ({
    id: "uid-1",
    email: overrides.email ?? "user@example.com",
    password: "secret",
    username: overrides.username ?? "user",
    first_name: null,
    last_name: null,
    role: overrides.role ?? Role.Customer,
    token: "jwt-token",
    created_at: new Date(),
    last_login: new Date(),
});

describe("AuthContext", () => {
    beforeEach(() => {
        sessionStorage.clear();
        mockedAxios.get.mockReset();
    });

    afterEach(() => {
        sessionStorage.clear();
    });

    it("renders the default context when used outside a provider", () => {
        render(<Probe />);
        expect(screen.getByTestId("loading").textContent).toBe("true");
        expect(screen.getByTestId("user").textContent).toBe("anonymous");
    });

    it("starts with loading=true and no user", () => {
        mockedAxios.get.mockResolvedValue({ status: 200, data: { userData: null } });
        render(
            <AuthProvider>
                <Probe />
            </AuthProvider>
        );
        expect(screen.getByTestId("loading").textContent).toBe("true");
        expect(screen.getByTestId("user").textContent).toBe("anonymous");
    });

    it("fetches user data and turns off loading on success", async () => {
        mockedAxios.get.mockResolvedValue({
            status: 200,
            data: { userData: buildUser({ email: "fetched@example.com" }) },
        });

        render(
            <AuthProvider>
                <Probe />
            </AuthProvider>
        );

        await waitFor(() => {
            expect(screen.getByTestId("loading").textContent).toBe("false");
        });
        expect(screen.getByTestId("user").textContent).toBe("fetched@example.com");
    });

    it("clears user data when the request fails", async () => {
        mockedAxios.get.mockRejectedValue(new Error("network down"));
        render(
            <AuthProvider>
                <Probe />
            </AuthProvider>
        );

        await waitFor(() => {
            expect(screen.getByTestId("loading").textContent).toBe("false");
        });
        expect(screen.getByTestId("user").textContent).toBe("anonymous");
    });

    it("clears user data when the server responds with non-200", async () => {
        sessionStorage.setItem("userData", JSON.stringify(buildUser({ email: "stale@example.com" })));
        mockedAxios.get.mockResolvedValue({ status: 401, data: {} });

        render(
            <AuthProvider>
                <Probe />
            </AuthProvider>
        );

        await waitFor(() => {
            expect(screen.getByTestId("user").textContent).toBe("anonymous");
        });
        expect(sessionStorage.getItem("userData")).toBeNull();
    });

    it("hydrates initial state from sessionStorage", () => {
        sessionStorage.setItem("userData", JSON.stringify(buildUser({ email: "cached@example.com" })));
        mockedAxios.get.mockResolvedValue({ status: 200, data: { userData: buildUser({ email: "cached@example.com" }) } });

        render(
            <AuthProvider>
                <Probe />
            </AuthProvider>
        );

        expect(screen.getByTestId("user").textContent).toBe("cached@example.com");
    });

    it("writes user data to sessionStorage on update", async () => {
        mockedAxios.get.mockResolvedValue({
            status: 200,
            data: { userData: buildUser({ email: "persisted@example.com" }) },
        });

        render(
            <AuthProvider>
                <Probe />
            </AuthProvider>
        );

        await waitFor(() => {
            expect(screen.getByTestId("user").textContent).toBe("persisted@example.com");
        });
        const stored = JSON.parse(sessionStorage.getItem("userData") || "{}");
        expect(stored.email).toBe("persisted@example.com");
    });

    it("removes user data from sessionStorage when set to null", async () => {
        mockedAxios.get.mockResolvedValue({
            status: 200,
            data: { userData: buildUser({ email: "temp@example.com" }) },
        });

        render(
            <AuthProvider>
                <Probe />
            </AuthProvider>
        );

        await waitFor(() => {
            expect(sessionStorage.getItem("userData")).not.toBeNull();
        });

        act(() => {
            screen.getByText("clear").click();
        });

        expect(sessionStorage.getItem("userData")).toBeNull();
    });

    it("falls back to null when stored session data is invalid JSON", () => {
        sessionStorage.setItem("userData", "not-json");
        mockedAxios.get.mockResolvedValue({ status: 200, data: { userData: null } });

        render(
            <AuthProvider>
                <Probe />
            </AuthProvider>
        );

        expect(screen.getByTestId("user").textContent).toBe("anonymous");
    });
});
