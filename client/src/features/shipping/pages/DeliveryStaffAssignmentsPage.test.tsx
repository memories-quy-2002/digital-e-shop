import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DeliveryStaffAssignmentsPage from "./DeliveryStaffAssignmentsPage";

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), update: vi.fn(), addToast: vi.fn(), translate: (key: string) => key }));
vi.mock("../api", () => ({ fetchDeliveryStaffAssignments: mocks.fetch, updateDeliveryStaffAssignment: mocks.update }));
vi.mock("../../../hooks/useT", () => ({ useT: () => mocks.translate }));
vi.mock("../../../context/LocaleContext", () => ({ useLocale: () => ({ locale: "en" }) }));
vi.mock("../../../components/layout/Layout", () => ({ default: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock("../../../context/ToastContext", () => ({ useToast: () => ({ addToast: mocks.addToast }) }));

const assignment = {
    id: 31, orderId: 501, employeeId: "staff-1", employeeName: "Delivery Staff",
    scheduledStartAt: "2026-10-16T02:00:00.000Z", scheduledEndAt: "2026-10-16T04:00:00.000Z",
    status: "ASSIGNED", failureReason: null, events: [],
    order: {
        destination: { recipientName: "Customer", recipientPhone: "0901234567", addressLine: "12 Main Street", city: "HCMC", country: "VN", latitude: 10.78, longitude: 106.7 },
        paymentMethod: "cash", codAmountVnd: 125000, items: [{ productName: "Keyboard", sku: "KB-1", quantity: 1, unitPriceVnd: 125000, totalPriceVnd: 125000 }],
    },
};

describe("DeliveryStaffAssignmentsPage", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.fetch.mockResolvedValue([assignment]);
        mocks.update.mockResolvedValue({ ...assignment, status: "OUT_FOR_DELIVERY" });
    });

    it("shows only assigned order details and starts the delivery without a live map", async () => {
        render(<DeliveryStaffAssignmentsPage />);
        expect(await screen.findByText("12 Main Street, HCMC")).toBeInTheDocument();
        expect(screen.getByText("Keyboard × 1")).toBeInTheDocument();
        expect(screen.getByText("shipping.codAmount:")).toBeInTheDocument();
        expect(document.body.textContent?.replace(/\s/g, "")).toContain("125.000");
        expect(screen.queryByRole("application")).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "shipping.startDelivery" }));
        await waitFor(() => expect(mocks.update).toHaveBeenCalledWith(31, { status: "OUT_FOR_DELIVERY" }));
    });

    it("requires a failure reason before updating a failed delivery", async () => {
        mocks.fetch.mockResolvedValue([{ ...assignment, status: "OUT_FOR_DELIVERY" }]);
        render(<DeliveryStaffAssignmentsPage />);
        fireEvent.click(await screen.findByRole("button", { name: "shipping.reportFailure" }));
        expect(screen.getByRole("button", { name: "shipping.confirmFailure" })).toBeDisabled();
        fireEvent.change(screen.getByLabelText("shipping.failureReason"), { target: { value: "Customer unavailable" } });
        fireEvent.click(screen.getByRole("button", { name: "shipping.confirmFailure" }));
        await waitFor(() => expect(mocks.update).toHaveBeenCalledWith(31, { status: "DELIVERY_FAILED", failureReason: "Customer unavailable" }));
    });
});
