import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import RequireDeliveryStaff from "./RequireDeliveryStaff";
import { Role, type UserData } from "../../../types/user";

vi.mock("../../../context/AuthContext", () => ({ useAuth: vi.fn() }));
vi.mock("../../../components/common/LoadingScreen", () => ({ default: () => <div>Loading</div> }));

import { useAuth } from "../../../context/AuthContext";

const mockedUseAuth = vi.mocked(useAuth);
const buildUser = (overrides: Partial<NonNullable<UserData>> = {}): NonNullable<UserData> => ({
    id: "staff-1", email: "staff@example.test", username: "staff", first_name: "Delivery", last_name: "Staff",
    role: Role.DeliveryStaff, status: "Active", created_at: new Date("2026-01-01"), last_login: new Date("2026-01-01"),
    ...overrides,
});
const Location = () => {
    const location = useLocation();
    return <span data-testid="location">{location.pathname + location.search}</span>;
};
const renderGuard = (auth: { loading: boolean; userData: UserData }) => {
    mockedUseAuth.mockReturnValue({ ...auth, setUserData: vi.fn() });
    return render(<MemoryRouter initialEntries={["/delivery/assignments"]}><Routes>
        <Route path="/delivery/assignments" element={<RequireDeliveryStaff><div>Staff workspace</div></RequireDeliveryStaff>} />
        <Route path="/login" element={<div>Login</div>} /><Route path="/403" element={<div>Forbidden</div>} />
    </Routes><Location /></MemoryRouter>);
};

describe("RequireDeliveryStaff", () => {
    it("allows only an active DeliveryStaff account", () => {
        renderGuard({ loading: false, userData: buildUser() });
        expect(screen.getByText("Staff workspace")).toBeInTheDocument();
    });

    it.each([
        [Role.Customer, "Active"], [Role.Admin, "Active"], [Role.DeliveryStaff, "Suspended"],
    ] as const)("denies %s accounts in %s status", (role, status) => {
        renderGuard({ loading: false, userData: buildUser({ role, status }) });
        expect(screen.getByTestId("location")).toHaveTextContent("/403");
    });

    it("preserves the staff destination for anonymous users", () => {
        renderGuard({ loading: false, userData: null });
        expect(screen.getByTestId("location")).toHaveTextContent("/login?redirect=%2Fdelivery%2Fassignments");
    });
});
