// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import AdminFulfillmentPage from "./AdminFulfillmentPage";
import * as api from "../api";

vi.mock("../api", () => ({ fetchFulfillmentOrders: vi.fn(), fetchFulfillmentOrder: vi.fn(), transitionFulfillment: vi.fn(), createFulfillmentShipment: vi.fn(), fetchFulfillmentLabel: vi.fn(), confirmReturnedShipment: vi.fn() }));
const mocks = vi.hoisted(() => ({ translate: (key: string) => key }));
vi.mock("../../../hooks/useT", () => ({ useT: () => mocks.translate }));
vi.mock("../../../components/layout/AdminLayout", () => ({ default: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock("../../admin/components/AdminStatusPanel", () => ({ default: ({ title, description }: { title: string; description?: string }) => <div><p>{title}</p>{description ? <p>{description}</p> : null}</div> }));

describe("AdminFulfillmentPage", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(api.fetchFulfillmentOrders).mockResolvedValue([{ orderId: 8, state: "CONFIRMED", trackingCode: null, sandbox: true }]);
        vi.mocked(api.fetchFulfillmentOrder).mockResolvedValue({ orderId: 8, state: "CONFIRMED", events: [] });
    });

    it("shows only the allowed next state and submits the transition", async () => {
        render(<AdminFulfillmentPage />);
        fireEvent.click(await screen.findByRole("button", { name: "shipping.state.PICKING" }));
        await waitFor(() => expect(api.transitionFulfillment).toHaveBeenCalledWith(8, "PICKING"));
        expect(screen.queryByRole("button", { name: "shipping.confirmReturnReceived" })).not.toBeInTheDocument();
    });

    it("keeps a shipment request pending and shows the sandbox status", async () => {
        vi.mocked(api.fetchFulfillmentOrders).mockResolvedValue([{ orderId: 8, state: "READY_TO_SHIP", trackingCode: null, sandbox: true }]);
        vi.mocked(api.fetchFulfillmentOrder).mockResolvedValue({ orderId: 8, state: "READY_TO_SHIP", trackingCode: null, sandbox: true, events: [] });
        let finishRequest!: () => void;
        vi.mocked(api.createFulfillmentShipment).mockReturnValue(new Promise((resolve) => { finishRequest = () => resolve({ sandbox: true }); }));
        render(<AdminFulfillmentPage />);

        expect(await screen.findByText("shipping.sandboxShipment")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "shipping.createShipment" }));

        expect(await screen.findByRole("button", { name: "shipping.actionPending" })).toBeDisabled();
        finishRequest();
        await waitFor(() => expect(api.createFulfillmentShipment).toHaveBeenCalledWith(8, expect.any(String)));
    });

    it("shows a safe failure state when shipment creation fails", async () => {
        vi.mocked(api.fetchFulfillmentOrders).mockResolvedValue([{ orderId: 8, state: "READY_TO_SHIP", trackingCode: null, sandbox: false }]);
        vi.mocked(api.fetchFulfillmentOrder).mockResolvedValue({ orderId: 8, state: "READY_TO_SHIP", trackingCode: null, sandbox: false, events: [] });
        vi.mocked(api.createFulfillmentShipment).mockRejectedValue(new Error("private provider response"));
        render(<AdminFulfillmentPage />);

        fireEvent.click(await screen.findByRole("button", { name: "shipping.createShipment" }));

        expect(await screen.findByText("shipping.adminActionError")).toBeInTheDocument();
        expect(screen.queryByText("private provider response")).not.toBeInTheDocument();
    });
});
