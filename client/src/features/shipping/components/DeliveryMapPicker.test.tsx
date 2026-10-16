// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DeliveryMapPicker from "./DeliveryMapPicker";

const mocks = vi.hoisted(() => {
    const map = {
        setView: vi.fn(),
        on: vi.fn(),
        off: vi.fn(),
        remove: vi.fn(),
        fitBounds: vi.fn(),
    };
    map.setView.mockReturnValue(map);
    const layer = { addTo: vi.fn(), setLatLngs: vi.fn(), setLatLng: vi.fn(), on: vi.fn(), off: vi.fn(), remove: vi.fn() };
    layer.addTo.mockReturnValue(layer);
    const marker = { addTo: vi.fn(), setLatLng: vi.fn(), on: vi.fn(), off: vi.fn() };
    marker.addTo.mockReturnValue(marker);
    const bounds = { pad: vi.fn(() => bounds) };
    return { map, layer, marker, bounds, translate: (key: string) => key, tileLayer: vi.fn(() => layer), polyline: vi.fn(() => layer), markerFactory: vi.fn(() => marker), divIcon: vi.fn(() => ({})) };
});

vi.mock("leaflet", () => ({
    map: () => mocks.map,
    tileLayer: mocks.tileLayer,
    polyline: mocks.polyline,
    marker: mocks.markerFactory,
    divIcon: mocks.divIcon,
    latLngBounds: () => mocks.bounds,
}));
vi.mock("../../../hooks/useT", () => ({ useT: () => mocks.translate }));

describe("DeliveryMapPicker", () => {
    const store = { latitude: 10.78, longitude: 106.7 };
    const destination = { latitude: 10.79, longitude: 106.71 };

    beforeEach(() => {
        vi.clearAllMocks();
        mocks.map.setView.mockReturnValue(mocks.map);
        mocks.layer.addTo.mockReturnValue(mocks.layer);
        mocks.marker.addTo.mockReturnValue(mocks.marker);
        Object.defineProperty(navigator, "geolocation", {
            configurable: true,
            value: { getCurrentPosition: vi.fn(), watchPosition: vi.fn() },
        });
    });

    it("shows the configured route and visible tile attribution without requesting device location", async () => {
        const onDestinationChange = vi.fn();
        const { unmount } = render(
            <DeliveryMapPicker
                store={store}
                storeAddress="Digital-E Store"
                destination={destination}
                route={[[106.7, 10.78], [106.71, 10.79]]}
                tileUrl="https://tiles.example.test/{z}/{x}/{y}.png"
                tileAttribution="Map data contributors"
                onDestinationChange={onDestinationChange}
            />,
        );

        await waitFor(() => expect(mocks.tileLayer).toHaveBeenCalledWith(
            "https://tiles.example.test/{z}/{x}/{y}.png",
            expect.objectContaining({ attribution: "Map data contributors" }),
        ));
        expect(screen.getByText("Map data contributors")).toBeInTheDocument();
        await waitFor(() => expect(mocks.polyline).toHaveBeenCalledOnce());
        expect(screen.getByLabelText("shipping.latitude")).toHaveValue(10.79);
        expect(screen.getByLabelText("shipping.longitude")).toHaveValue(106.71);
        expect(mocks.markerFactory).toHaveBeenCalledTimes(2);
        expect(mocks.polyline).toHaveBeenCalledOnce();
        expect(navigator.geolocation.getCurrentPosition).not.toHaveBeenCalled();
        expect(navigator.geolocation.watchPosition).not.toHaveBeenCalled();

        unmount();
        expect(mocks.map.off).toHaveBeenCalled();
        expect(mocks.map.remove).toHaveBeenCalledOnce();
    });

    it("supports a keyboard-operable coordinate alternative to dragging the pin", async () => {
        const onDestinationChange = vi.fn();
        render(
            <DeliveryMapPicker
                store={store}
                storeAddress="Digital-E Store"
                destination={destination}
                route={[]}
                tileUrl="https://tiles.example.test/{z}/{x}/{y}.png"
                tileAttribution="Map data contributors"
                onDestinationChange={onDestinationChange}
            />,
        );

        await screen.findByLabelText("shipping.latitude");
        fireEvent.change(screen.getByLabelText("shipping.latitude"), { target: { value: "10.8" } });
        expect(onDestinationChange).toHaveBeenLastCalledWith({ latitude: 10.8, longitude: 106.71 });
        expect(screen.getByRole("status")).toHaveTextContent("shipping.pinSelected");
    });

    it("lets a map click manually position a destination pin", async () => {
        const onDestinationChange = vi.fn();
        render(
            <DeliveryMapPicker
                store={store}
                storeAddress="Digital-E Store"
                destination={null}
                route={[]}
                tileUrl="https://tiles.example.test/{z}/{x}/{y}.png"
                tileAttribution="Map data contributors"
                onDestinationChange={onDestinationChange}
            />,
        );

        await waitFor(() => expect(mocks.map.on).toHaveBeenCalledWith("click", expect.any(Function)));
        const clickHandler = mocks.map.on.mock.calls.find((call: unknown[]) => call[0] === "click")?.[1] as ((event: { latlng: { lat: number; lng: number } }) => void) | undefined;
        if (!clickHandler) throw new Error("Map click handler was not registered");
        act(() => clickHandler({ latlng: { lat: 10.8, lng: 106.72 } }));
        expect(onDestinationChange).toHaveBeenCalledWith({ latitude: 10.8, longitude: 106.72 });
    });

    it("treats operator-provided attribution as text inside Leaflet's HTML attribution control", async () => {
        render(
            <DeliveryMapPicker
                store={store}
                storeAddress="Store"
                destination={null}
                route={[]}
                tileUrl="https://tiles.example.test/{z}/{x}/{y}.png"
                tileAttribution="<img src=x onerror=alert(1)>"
                onDestinationChange={vi.fn()}
            />,
        );

        await waitFor(() => expect(mocks.tileLayer).toHaveBeenLastCalledWith(
            "https://tiles.example.test/{z}/{x}/{y}.png",
            expect.objectContaining({ attribution: "&lt;img src=x onerror=alert(1)&gt;" }),
        ));
    });
});
