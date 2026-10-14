// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ShipmentTimeline from "./ShipmentTimeline";

const mocks = vi.hoisted(() => ({ translate: (key: string) => key }));
vi.mock("../../../hooks/useT", () => ({ useT: () => mocks.translate }));

describe("ShipmentTimeline", () => {
    it("renders a safe guest shipment summary and sandbox state", () => {
        render(<ShipmentTimeline shipment={{ orderId: 4, state: "IN_TRANSIT", trackingCode: "TRACK-4", sandbox: true, events: [{ state: "PICKED_UP", occurredAt: "2026-10-14T10:00:00Z", note: null }] }} />);
        expect(screen.getByText("TRACK-4")).toBeInTheDocument();
        expect(screen.getByText("shipping.sandboxShipment")).toBeInTheDocument();
        expect(screen.getByText("PICKED UP")).toBeInTheDocument();
    });

    it("shows a pending empty state without claiming shipment exists", () => {
        render(<ShipmentTimeline shipment={null} />);
        expect(screen.getByText("shipping.noShipment")).toBeInTheDocument();
    });
});
