import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ShipmentTimeline from "./ShipmentTimeline";
import type { ShipmentSummary } from "../types";

vi.mock("../../../hooks/useT", () => ({ useT: () => (key: string) => key.startsWith("shipping.state.") ? key.slice("shipping.state.".length) : key }));
vi.mock("../../../context/LocaleContext", () => ({ useLocale: () => ({ locale: "en" }) }));

describe("ShipmentTimeline internal delivery projection", () => {
    it("shows assigned staff and customer-safe events while retaining legacy shipment history", () => {
        const shipment: ShipmentSummary = {
            orderId: 501,
            state: "READY_TO_SHIP",
            events: [{ state: "READY_TO_SHIP", occurredAt: "2026-10-16T01:00:00.000Z", note: "Parcel packed" }],
            delivery: {
                id: 7, orderId: 501, employeeName: "Delivery Staff", scheduledStartAt: "2026-10-16T02:00:00.000Z",
                scheduledEndAt: "2026-10-16T04:00:00.000Z", status: "OUT_FOR_DELIVERY",
                events: [{ id: 9, status: "OUT_FOR_DELIVERY", publicNote: "Delivery is on the way", createdAt: "2026-10-16T02:05:00.000Z" }],
            },
        };
        render(<ShipmentTimeline shipment={shipment} />);

        expect(screen.getAllByText("OUT_FOR_DELIVERY")).toHaveLength(2);
        expect(screen.getByText("Delivery Staff")).toBeInTheDocument();
        expect(screen.getByText("Parcel packed")).toBeInTheDocument();
        expect(screen.getByText("Delivery is on the way")).toBeInTheDocument();
        expect(screen.queryByRole("application")).not.toBeInTheDocument();
    });
});
