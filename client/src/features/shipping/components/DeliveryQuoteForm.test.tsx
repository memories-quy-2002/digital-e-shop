// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DeliveryQuoteForm from "./DeliveryQuoteForm";
import * as shippingApi from "../api";
import type { DeliveryMapConfig, InternalDeliveryQuote } from "../types";
import { dictionaries } from "../../../i18n";

const mocks = vi.hoisted(() => ({ translate: (key: string) => key }));
vi.mock("../api", () => ({ fetchDeliveryMapConfig: vi.fn(), findDeliveryAddressLocations: vi.fn(), requestInternalDeliveryQuote: vi.fn() }));
vi.mock("./DeliveryMapPicker", () => ({
    default: ({ destination, onDestinationChange }: { destination: { latitude: number; longitude: number } | null; onDestinationChange: (point: { latitude: number; longitude: number }) => void }) => (
        <>
            <button type="button" onClick={() => onDestinationChange({ latitude: 10.79, longitude: 106.71 })}>Choose destination pin</button>
            <input aria-label="shipping.latitude" readOnly value={destination?.latitude ?? ""} />
            <input aria-label="shipping.longitude" readOnly value={destination?.longitude ?? ""} />
        </>
    ),
}));
vi.mock("../../../context/LocaleContext", () => ({ useLocale: () => ({ locale: "vi" }) }));
vi.mock("../../../hooks/useT", () => ({ useT: () => mocks.translate }));

const mapConfig: DeliveryMapConfig = {
    storeAddress: "Digital-E Store",
    origin: { latitude: 10.78, longitude: 106.7 },
    tileUrl: "https://tiles.example.test/{z}/{x}/{y}.png",
    tileAttribution: "Map data contributors",
};
const quote: InternalDeliveryQuote = {
    id: "quote-1",
    address: { recipientName: "Guest Buyer", recipientPhone: "0901234567", addressLine: "12 Main Street, HCMC", city: "HCMC", country: "VN", latitude: 10.79, longitude: 106.71 },
    origin: mapConfig.origin,
    destination: { latitude: 10.79, longitude: 106.71 },
    distanceMeters: 4300,
    routeGeometry: [[106.7, 10.78], [106.71, 10.79]],
    pricing: { itemsSubtotal: 100000, merchandiseDiscount: 5000, shippingFee: 0, payableTotal: 95000, currency: "VND" as const },
    settingsVersion: 2,
    tileUrl: mapConfig.tileUrl,
    tileAttribution: mapConfig.tileAttribution,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
};

describe("DeliveryQuoteForm", () => {
    const onQuoteChange = vi.fn();
    const cart = [{ productId: 5, quantity: 1 }];

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(shippingApi.fetchDeliveryMapConfig).mockResolvedValue(mapConfig);
        vi.mocked(shippingApi.findDeliveryAddressLocations).mockResolvedValue([]);
        vi.mocked(shippingApi.requestInternalDeliveryQuote).mockResolvedValue(quote);
    });

    it("uses clear delivery-address and delivery-fee wording in both locales", () => {
        expect(dictionaries.en.shipping.deliveryAddress).toBe("Delivery address");
        expect(dictionaries.en.shipping.deliveryDetails).toBe("Delivery address");
        expect(dictionaries.en.shipping.getQuote).toBe("Calculate delivery fee");
        expect(dictionaries.vi.shipping.deliveryAddress).toBe("Địa chỉ giao hàng");
        expect(dictionaries.vi.shipping.deliveryDetails).toBe("Địa chỉ giao hàng");
        expect(dictionaries.vi.shipping.getQuote).toBe("Tính phí giao hàng");
    });

    it("creates an internal road-distance quote using a manually selected pin", async () => {
        const { container } = render(<DeliveryQuoteForm cart={cart} discountCode="SAVE" guest onQuoteChange={onQuoteChange} />);

        fireEvent.change(screen.getByLabelText("shipping.recipientName"), { target: { value: "Guest Buyer" } });
        fireEvent.change(screen.getByLabelText("shipping.recipientPhone"), { target: { value: "0901234567" } });
        fireEvent.change(screen.getByLabelText("shipping.deliveryAddress"), { target: { value: "12 Main Street, HCMC" } });
        fireEvent.click(await screen.findByText("shipping.locationManualAdjust"));
        await screen.findByRole("button", { name: "Choose destination pin" });
        fireEvent.click(screen.getByRole("button", { name: "Choose destination pin" }));
        fireEvent.click(screen.getByRole("button", { name: "shipping.getQuote" }));

        await waitFor(() => expect(shippingApi.requestInternalDeliveryQuote).toHaveBeenCalledWith({
            address: {
                recipientName: "Guest Buyer",
                recipientPhone: "0901234567",
                addressLine: "12 Main Street, HCMC",
                city: "HCMC",
                country: "VN",
                latitude: 10.79,
                longitude: 106.71,
            },
            locale: "vi",
            discountCode: "SAVE",
            cart,
        }, true));
        expect(container.querySelector(".shipping-quote__result")).toHaveTextContent("shipping.roadDistance");
        expect(screen.getByText("4.3 km")).toBeInTheDocument();
        expect(onQuoteChange).toHaveBeenLastCalledWith(quote.address, quote);
    });

    it("explains that checkout is blocked when the store has no delivery configuration", async () => {
        vi.mocked(shippingApi.fetchDeliveryMapConfig).mockResolvedValue(null);
        render(<DeliveryQuoteForm cart={cart} guest onQuoteChange={onQuoteChange} />);

        expect(await screen.findByRole("alert")).toHaveTextContent("shipping.mapNotConfigured");
        expect(screen.queryByRole("button", { name: "shipping.retryMap" })).not.toBeInTheDocument();
        expect(screen.queryByText("shipping.quoteRequired")).not.toBeInTheDocument();
        expect(screen.getByRole("button", { name: "shipping.getQuote" })).toBeDisabled();
        expect(shippingApi.requestInternalDeliveryQuote).not.toHaveBeenCalled();
    });

    it("prefills saved coordinates and offers address suggestions when an address has no pin", async () => {
        const { rerender } = render(<DeliveryQuoteForm
            cart={cart}
            guest={false}
            addressPrefill={{ key: "saved:1", recipientName: "Buyer", recipientPhone: "0901234567", addressLine: "12 Main Street", city: "HCMC", latitude: 10.79, longitude: 106.71 }}
            onQuoteChange={onQuoteChange}
        />);
        fireEvent.click(await screen.findByText("shipping.locationManualAdjust"));
        expect(await screen.findByLabelText("shipping.latitude")).toHaveValue("10.79");
        expect(screen.getByLabelText("shipping.deliveryAddress")).toHaveValue("12 Main Street, HCMC");

        rerender(<DeliveryQuoteForm cart={cart} guest={false} addressPrefill={{ key: "saved:2", recipientName: "Buyer", recipientPhone: "0901234567", addressLine: "12 Main Street", city: "HCMC" }} onQuoteChange={onQuoteChange} />);
        await waitFor(() => expect(screen.getByLabelText("shipping.latitude")).toHaveValue(""));
        expect(screen.getByLabelText("shipping.deliveryAddress")).toHaveValue("12 Main Street, HCMC");
        expect(screen.getByRole("button", { name: "shipping.getQuote" })).toBeEnabled();
        fireEvent.click(screen.getByRole("button", { name: "shipping.getQuote" }));
        expect(await screen.findByRole("alert")).toHaveTextContent("shipping.chooseMapPin");
        expect(shippingApi.requestInternalDeliveryQuote).not.toHaveBeenCalled();
    });

    it("automatically suggests locations and moves the map when a suggestion is selected", async () => {
        const onCoordinatesConfirmed = vi.fn().mockResolvedValue(true);
        vi.mocked(shippingApi.findDeliveryAddressLocations).mockResolvedValue([
            { label: "12 Main Street, HCMC", city: "Ho Chi Minh City", latitude: 10.79, longitude: 106.71 },
        ]);
        render(<DeliveryQuoteForm cart={cart} guest={false}
            addressPrefill={{ key: "saved:2", addressLine: "12 Main Street", city: "HCMC" }}
            onQuoteChange={onQuoteChange} onCoordinatesConfirmed={onCoordinatesConfirmed} />);

        fireEvent.change(screen.getByLabelText("shipping.deliveryAddress"), { target: { value: "12 Main Street" } });
        fireEvent.click(await screen.findByRole("option", { name: /12 Main Street, HCMC/ }));

        expect(shippingApi.findDeliveryAddressLocations).toHaveBeenCalledWith({ addressLine: "12 Main Street", city: "", locale: "vi" });
        await waitFor(() => expect(onCoordinatesConfirmed).toHaveBeenCalledWith({ latitude: 10.79, longitude: 106.71 }, "12 Main Street, HCMC", "Ho Chi Minh City"));
        expect(screen.getByLabelText("shipping.latitude")).toHaveValue("10.79");
        expect(screen.getByText("Choose destination pin")).toBeVisible();
        expect(await screen.findByRole("status")).toHaveTextContent("shipping.locationSaved");
    });

    it("shows retryable route failures and does not retain an invalid quote", async () => {
        vi.mocked(shippingApi.requestInternalDeliveryQuote).mockRejectedValueOnce(new Error("No route"));
        render(<DeliveryQuoteForm cart={cart} guest onQuoteChange={onQuoteChange} />);
        fireEvent.change(screen.getByLabelText("shipping.recipientName"), { target: { value: "Buyer" } });
        fireEvent.change(screen.getByLabelText("shipping.recipientPhone"), { target: { value: "0901234567" } });
        fireEvent.change(screen.getByLabelText("shipping.deliveryAddress"), { target: { value: "12 Main Street, HCMC" } });
        fireEvent.click(await screen.findByText("shipping.locationManualAdjust"));
        await screen.findByRole("button", { name: "Choose destination pin" });
        fireEvent.click(screen.getByRole("button", { name: "Choose destination pin" }));
        fireEvent.click(screen.getByRole("button", { name: "shipping.getQuote" }));

        expect(await screen.findByRole("alert")).toHaveTextContent("shipping.quoteError");
        expect(onQuoteChange).toHaveBeenLastCalledWith(null, null);
        fireEvent.click(screen.getByRole("button", { name: "shipping.getQuote" }));
        await waitFor(() => expect(shippingApi.requestInternalDeliveryQuote).toHaveBeenCalledTimes(2));
        expect(document.querySelector(".shipping-quote__result")).toHaveTextContent("shipping.roadDistance");
    });

    it("invalidates a checkout quote while keeping the address and map pin intact", async () => {
        const props = { invalidateQuoteKey: 0 };
        const { rerender } = render(<DeliveryQuoteForm cart={cart} guest onQuoteChange={onQuoteChange} {...props} />);
        fireEvent.change(screen.getByLabelText("shipping.recipientName"), { target: { value: "Guest Buyer" } });
        fireEvent.change(screen.getByLabelText("shipping.recipientPhone"), { target: { value: "0901234567" } });
        fireEvent.change(screen.getByLabelText("shipping.deliveryAddress"), { target: { value: "12 Main Street, HCMC" } });
        fireEvent.click(await screen.findByText("shipping.locationManualAdjust"));
        fireEvent.click(await screen.findByRole("button", { name: "Choose destination pin" }));
        fireEvent.click(screen.getByRole("button", { name: "shipping.getQuote" }));
        await waitFor(() => expect(document.querySelector(".shipping-quote__result")).toBeInTheDocument());

        rerender(<DeliveryQuoteForm cart={cart} guest onQuoteChange={onQuoteChange} invalidateQuoteKey={1} />);

        expect(screen.getByLabelText("shipping.recipientName")).toHaveValue("Guest Buyer");
        expect(screen.getByLabelText("shipping.recipientPhone")).toHaveValue("0901234567");
        expect(screen.getByLabelText("shipping.deliveryAddress")).toHaveValue("12 Main Street, HCMC");
        expect(screen.getByLabelText("shipping.latitude")).toHaveValue("10.79");
        expect(screen.queryByText("shipping.roadDistance")).not.toBeInTheDocument();
        expect(screen.getByRole("alert")).toHaveTextContent("shipping.quoteInvalidated");
        expect(screen.getByRole("button", { name: "shipping.getQuote" })).toBeEnabled();
    });
});
