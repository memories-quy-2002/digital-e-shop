import { renderWithLocale } from '../../../test-utils/renderWithLocale';
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminAccountPage from "./AdminAccountPage";

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), update: vi.fn(), profile: vi.fn(), toast: vi.fn() }));
vi.mock("../api", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../api")>()),
    fetchAdminUsersPage: mocks.fetch,
    updateAccount: mocks.update,
    fetchCustomerProfile: mocks.profile,
}));
vi.mock("../../../components/layout/AdminLayout", () => ({ default: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock("../../../context/ToastContext", () => ({ useToast: () => ({ addToast: mocks.toast }) }));
vi.mock("../../../hooks/useT", () => ({ useT: () => (key: string) => key }));

describe("AdminAccountPage delivery role management", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.fetch.mockResolvedValue({
            items: [{ id: "customer-1", email: "customer@example.test", username: "customer", first_name: "Test", last_name: "Customer", role: "Customer", status: "Active", order_count: 0, created_at: "2026-01-01T00:00:00.000Z" }],
            pagination: { page: 1, limit: 8, total: 1, totalPages: 1 },
            summary: { total: 1, customers: 1, suspended: 0 },
        });
        mocks.update.mockResolvedValue({ account: { role: "DeliveryStaff", status: "Active" } });
    });

    it("grants the DeliveryStaff role only after an audited reason is confirmed", async () => {
        renderWithLocale(<AdminAccountPage />);
        const row = await screen.findByRole("row", { name: /customer@example.test/i });
        const roleSelect = within(row).getAllByRole("combobox")[0];
        expect(within(roleSelect).getByRole("option", { name: "shipping.deliveryStaffRole" })).toHaveValue("DeliveryStaff");
        fireEvent.change(roleSelect, { target: { value: "DeliveryStaff" } });

        fireEvent.click(screen.getByLabelText("Other"));
        fireEvent.change(screen.getByLabelText("Describe the other reason"), { target: { value: "Delivery staff assignment" } });
        fireEvent.click(screen.getByRole("button", { name: "Confirm change" }));

        await waitFor(() => expect(mocks.update).toHaveBeenCalledWith("customer-1", {
            role: "DeliveryStaff", status: "Active", reason: "Other: Delivery staff assignment",
        }));
    });
});
