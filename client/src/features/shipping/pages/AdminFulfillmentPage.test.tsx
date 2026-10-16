import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminFulfillmentPage from "./AdminFulfillmentPage";

const mocks = vi.hoisted(() => ({
    fetchOrders: vi.fn(), fetchDetail: vi.fn(), fetchAssignable: vi.fn(), fetchStaff: vi.fn(),
    fetchHistory: vi.fn(), assign: vi.fn(), translate: (key: string) => key,
}));
vi.mock("../api", () => ({
    fetchFulfillmentOrders: mocks.fetchOrders, fetchFulfillmentOrder: mocks.fetchDetail,
    fetchAssignableDeliveryOrders: mocks.fetchAssignable, fetchDeliveryStaff: mocks.fetchStaff,
    fetchDeliveryAssignmentHistory: mocks.fetchHistory, assignDeliveryOrder: mocks.assign,
    transitionFulfillment: vi.fn(),
}));
vi.mock("../../../components/layout/AdminLayout", () => ({ default: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock("../../../hooks/useT", () => ({ useT: () => mocks.translate }));
vi.mock("../../../context/LocaleContext", () => ({ useLocale: () => ({ locale: "en" }) }));
vi.mock("../../admin/components/AdminStatusPanel", () => ({ default: ({ title }: { title: string }) => <p>{title}</p> }));

const deliveryOrder = {
    orderId: 501, createdAt: "2026-10-16T01:00:00.000Z", customerName: "Test Customer",
    destination: { recipientName: "Test Customer", recipientPhone: "0901234567", addressLine: "12 Main Street", city: "HCMC", country: "VN", latitude: 10.78, longitude: 106.7 },
    paymentMethod: "cash", paymentStatus: "pending", codAmountVnd: 125000,
    items: [{ productName: "Laptop", sku: "LT-1", quantity: 1, unitPriceVnd: 125000, totalPriceVnd: 125000 }],
    currentAssignment: null,
};

describe("AdminFulfillmentPage internal assignments", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.fetchOrders.mockResolvedValue([]);
        mocks.fetchAssignable.mockResolvedValue([deliveryOrder]);
        mocks.fetchStaff.mockResolvedValue([{ id: "staff-1", name: "Delivery Staff" }]);
        mocks.fetchHistory.mockResolvedValue([]);
        mocks.assign.mockResolvedValue({ id: 7 });
    });

    it("shows order contents, COD and destination before assigning a staff schedule", async () => {
        render(<AdminFulfillmentPage />);
        expect(await screen.findByRole("heading", { name: "shipping.deliveryQueue" })).toBeInTheDocument();
        expect(screen.getByText("12 Main Street, HCMC")).toBeInTheDocument();
        expect(screen.getByText("Laptop × 1")).toBeInTheDocument();
        expect(document.body.textContent?.replace(/\s/g, "")).toContain("125.000");

        fireEvent.change(screen.getByLabelText("shipping.deliveryStaff"), { target: { value: "staff-1" } });
        fireEvent.change(screen.getByLabelText(/shipping.scheduleStart/), { target: { value: "2026-10-20T10:00" } });
        fireEvent.change(screen.getByLabelText(/shipping.scheduleEnd/), { target: { value: "2026-10-20T12:00" } });
        fireEvent.click(screen.getByRole("button", { name: "shipping.assignDelivery" }));

        await waitFor(() => expect(mocks.assign).toHaveBeenCalledWith(501, {
            employeeId: "staff-1", scheduledStartAt: "2026-10-20T10:00", scheduledEndAt: "2026-10-20T12:00",
        }));
    });

    it("shows legacy tracking as history and keeps GHN shipment states read-only", async () => {
        mocks.fetchOrders.mockResolvedValue([{ orderId: 42, state: "SHIPPED", provider: "GHN", trackingCode: "GHN-42", sandbox: false }]);
        mocks.fetchDetail.mockResolvedValue({ orderId: 42, state: "SHIPPED", provider: "GHN", trackingCode: "GHN-42", sandbox: false, timeline: [] });

        render(<AdminFulfillmentPage />);

        expect(await screen.findByText("GHN-42")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "shipping.state.PICKING" })).not.toBeInTheDocument();
    });
});
