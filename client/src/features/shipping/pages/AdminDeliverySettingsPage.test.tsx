import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import AdminDeliverySettingsPage from "./AdminDeliverySettingsPage";

const mocks = vi.hoisted(() => ({
    fetch: vi.fn(), save: vi.fn(), translate: (key: string) => key,
    settings: {
        storeAddress: "Digital-E Store", storeLatitude: 10.78, storeLongitude: 106.7,
        fee5To20Vnd: 25000, feeOver20Vnd: 50000, routingEndpoint: "https://router.example.test/route/v1/driving",
        tileUrl: "https://tiles.example.test/{z}/{x}/{y}.png", tileAttribution: "Map contributors", version: 2,
    },
}));
vi.mock("../api", () => ({ fetchAdminDeliverySettings: mocks.fetch, updateAdminDeliverySettings: mocks.save }));
vi.mock("../../../hooks/useT", () => ({ useT: () => mocks.translate }));
vi.mock("../../../components/layout/AdminLayout", () => ({ default: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock("../components/DeliveryMapPicker", () => ({ default: ({ onDestinationChange }: { onDestinationChange: (point: { latitude: number; longitude: number }) => void }) => <button type="button" onClick={() => onDestinationChange({ latitude: 10.81, longitude: 106.72 })}>Choose store pin</button> }));

describe("AdminDeliverySettingsPage", () => {
    it("loads allowlisted routing and tile choices and saves the selected store pin and fee bands", async () => {
        mocks.fetch.mockResolvedValue({ settings: mocks.settings, allowedRoutingEndpoints: [mocks.settings.routingEndpoint], allowedTileUrls: [mocks.settings.tileUrl] });
        mocks.save.mockResolvedValue(mocks.settings);
        render(<AdminDeliverySettingsPage />);

        fireEvent.click(await screen.findByRole("button", { name: "Choose store pin" }));
        fireEvent.change(screen.getByLabelText("shipping.storeAddress"), { target: { value: "New store" } });
        fireEvent.change(screen.getByLabelText("shipping.fee5To20"), { target: { value: "30000" } });
        fireEvent.change(screen.getByLabelText("shipping.feeOver20"), { target: { value: "60000" } });
        fireEvent.click(screen.getByRole("button", { name: "shipping.saveSettings" }));

        await waitFor(() => expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({
            storeAddress: "New store", storeLatitude: 10.81, storeLongitude: 106.72,
            fee5To20Vnd: 30000, feeOver20Vnd: 60000,
            routingEndpoint: mocks.settings.routingEndpoint, tileUrl: mocks.settings.tileUrl,
        })));
    });

    it("keeps settings retryable after a load failure", async () => {
        mocks.fetch.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ settings: mocks.settings, allowedRoutingEndpoints: [mocks.settings.routingEndpoint], allowedTileUrls: [mocks.settings.tileUrl] });
        render(<AdminDeliverySettingsPage />);
        fireEvent.click(await screen.findByRole("button", { name: "shipping.retry" }));
        await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(2));
        expect(await screen.findByLabelText("shipping.storeAddress")).toHaveValue(mocks.settings.storeAddress);
    });
});
