// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DeliveryQuoteForm from "./DeliveryQuoteForm";
import * as shippingApi from "../api";

vi.mock("../api", () => ({ fetchShippingProvinces: vi.fn(), fetchShippingWards: vi.fn(), fetchShippingServices: vi.fn(), requestShippingQuote: vi.fn() }));
vi.mock("../../../context/LocaleContext", () => ({ useLocale: () => ({ locale: "vi" }) }));
const mocks = vi.hoisted(() => ({ translate: (key: string) => key }));
vi.mock("../../../hooks/useT", () => ({ useT: () => mocks.translate }));

describe("DeliveryQuoteForm", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(shippingApi.fetchShippingProvinces).mockResolvedValue([{ code: "1", name: "Province" }]);
        vi.mocked(shippingApi.fetchShippingWards).mockResolvedValue([{ code: "2", provinceCode: "1", name: "Ward" }]);
        vi.mocked(shippingApi.fetchShippingServices).mockResolvedValue([{ serviceId: 9, serviceTypeId: 3, name: "Standard" }]);
        vi.mocked(shippingApi.requestShippingQuote).mockResolvedValue({ id: "q1", expiresAt: new Date(Date.now() + 60000).toISOString(), pricing: { itemsSubtotal: 1000, merchandiseDiscount: 0, shippingFee: 200, payableTotal: 1200, currency: "VND" }, address: {} as never, parcel: { grams: 100, lengthCm: 1, widthCm: 1, heightCm: 1 }, serviceTypeId: 3, expectedDeliveryAt: null, sandbox: true, parcelEstimated: true });
    });

    it("restores saved province and ward codes before requesting a new quote", async () => {
        render(<DeliveryQuoteForm
            guest
            cart={[{ productId: 5, quantity: 1 }]}
            addressPrefill={{ key: "saved:7", addressLine: "12 Main Street", provinceCode: "1", wardCode: "2" }}
            onQuoteChange={vi.fn()}
        />);

        expect(await screen.findByLabelText("shipping.province")).toHaveValue("1");
        await waitFor(() => expect(screen.getByLabelText("shipping.ward")).toHaveValue("2"));
    });

    it("restores a different saved ward when the selected address shares the province", async () => {
        vi.mocked(shippingApi.fetchShippingWards).mockResolvedValue([
            { code: "2", provinceCode: "1", name: "Ward A" },
            { code: "3", provinceCode: "1", name: "Ward B" },
        ]);
        const onQuoteChange = vi.fn();
        const view = render(<DeliveryQuoteForm
            guest
            cart={[{ productId: 5, quantity: 1 }]}
            addressPrefill={{ key: "saved:7", addressLine: "12 Main Street", provinceCode: "1", wardCode: "2" }}
            onQuoteChange={onQuoteChange}
        />);

        await waitFor(() => expect(screen.getByLabelText("shipping.ward")).toHaveValue("2"));
        view.rerender(<DeliveryQuoteForm
            guest
            cart={[{ productId: 5, quantity: 1 }]}
            addressPrefill={{ key: "saved:8", addressLine: "13 Main Street", provinceCode: "1", wardCode: "3" }}
            resetKey={1}
            onQuoteChange={onQuoteChange}
        />);

        await waitFor(() => expect(screen.getByLabelText("shipping.ward")).toHaveValue("3"));
    });

    it("quotes a complete structured address and emits the owner-bound quote", async () => {
        const onQuoteChange = vi.fn();
        render(<DeliveryQuoteForm guest cart={[{ productId: 5, quantity: 1 }]} discountCode="SAVE" onQuoteChange={onQuoteChange} />);
        fireEvent.change(await screen.findByLabelText("shipping.recipientName"), { target: { value: "Buyer" } });
        fireEvent.change(screen.getByLabelText("shipping.recipientPhone"), { target: { value: "0901234567" } });
        fireEvent.change(screen.getByLabelText("shipping.addressLine"), { target: { value: "1 Main" } });
        fireEvent.change(screen.getByLabelText("shipping.province"), { target: { value: "1" } });
        fireEvent.change(await screen.findByLabelText("shipping.ward"), { target: { value: "2" } });
        fireEvent.change(await screen.findByLabelText("shipping.service"), { target: { value: "3" } });
        fireEvent.click(screen.getByRole("button", { name: "shipping.getQuote" }));
        await waitFor(() => expect(shippingApi.requestShippingQuote).toHaveBeenCalledWith(expect.objectContaining({ cart: [{ productId: 5, quantity: 1 }], discountCode: "SAVE", locale: "vi" }), true));
        await waitFor(() => expect(onQuoteChange).toHaveBeenLastCalledWith(expect.objectContaining({ wardCode: "2", country: "VN" }), expect.objectContaining({ id: "q1" })));
    });

    it("invalidates an existing quote when the cart changes", async () => {
        const onQuoteChange = vi.fn();
        const view = render(<DeliveryQuoteForm guest cart={[{ productId: 5, quantity: 1 }]} onQuoteChange={onQuoteChange} />);
        fireEvent.change(await screen.findByLabelText("shipping.recipientName"), { target: { value: "Buyer" } });
        fireEvent.change(screen.getByLabelText("shipping.recipientPhone"), { target: { value: "0901234567" } });
        fireEvent.change(screen.getByLabelText("shipping.addressLine"), { target: { value: "1 Main" } });
        fireEvent.change(screen.getByLabelText("shipping.province"), { target: { value: "1" } });
        fireEvent.change(await screen.findByLabelText("shipping.ward"), { target: { value: "2" } });
        fireEvent.change(await screen.findByLabelText("shipping.service"), { target: { value: "3" } });
        fireEvent.click(screen.getByRole("button", { name: "shipping.getQuote" }));
        await waitFor(() => expect(onQuoteChange).toHaveBeenLastCalledWith(expect.any(Object), expect.objectContaining({ id: "q1" })));
        view.rerender(<DeliveryQuoteForm guest cart={[{ productId: 5, quantity: 2 }]} onQuoteChange={onQuoteChange} />);
        await waitFor(() => expect(onQuoteChange).toHaveBeenLastCalledWith(null, null));
        expect(screen.queryByText("shipping.sandboxQuote")).not.toBeInTheDocument();
    });

    it("invalidates a guest quote when the checkout identity changes", async () => {
        const onQuoteChange = vi.fn();
        const view = render(<DeliveryQuoteForm guest cart={[{ productId: 5, quantity: 1 }]} onQuoteChange={onQuoteChange} />);
        fireEvent.change(await screen.findByLabelText("shipping.recipientName"), { target: { value: "Buyer" } });
        fireEvent.change(screen.getByLabelText("shipping.recipientPhone"), { target: { value: "0901234567" } });
        fireEvent.change(screen.getByLabelText("shipping.addressLine"), { target: { value: "1 Main" } });
        fireEvent.change(screen.getByLabelText("shipping.province"), { target: { value: "1" } });
        fireEvent.change(await screen.findByLabelText("shipping.ward"), { target: { value: "2" } });
        fireEvent.change(await screen.findByLabelText("shipping.service"), { target: { value: "3" } });
        fireEvent.click(screen.getByRole("button", { name: "shipping.getQuote" }));
        await waitFor(() => expect(onQuoteChange).toHaveBeenLastCalledWith(expect.any(Object), expect.objectContaining({ id: "q1" })));

        view.rerender(<DeliveryQuoteForm guest={false} cart={[{ productId: 5, quantity: 1 }]} onQuoteChange={onQuoteChange} />);

        await waitFor(() => expect(onQuoteChange).toHaveBeenLastCalledWith(null, null));
        expect(screen.queryByText("shipping.sandboxQuote")).not.toBeInTheDocument();
    });

    it("expires the quote and requires the customer to request a fresh one", async () => {
        const onQuoteChange = vi.fn();
        vi.mocked(shippingApi.requestShippingQuote).mockResolvedValue({
            id: "q-expiring",
            expiresAt: new Date(Date.now() + 120).toISOString(),
            pricing: { itemsSubtotal: 1000, merchandiseDiscount: 0, shippingFee: 200, payableTotal: 1200, currency: "VND" },
            address: {} as never,
            parcel: { grams: 100, lengthCm: 1, widthCm: 1, heightCm: 1 },
            serviceTypeId: 3,
            expectedDeliveryAt: null,
            sandbox: true,
            parcelEstimated: true,
        });
        render(<DeliveryQuoteForm guest cart={[{ productId: 5, quantity: 1 }]} onQuoteChange={onQuoteChange} />);
        fireEvent.change(await screen.findByLabelText("shipping.recipientName"), { target: { value: "Buyer" } });
        fireEvent.change(screen.getByLabelText("shipping.recipientPhone"), { target: { value: "0901234567" } });
        fireEvent.change(screen.getByLabelText("shipping.addressLine"), { target: { value: "1 Main" } });
        fireEvent.change(screen.getByLabelText("shipping.province"), { target: { value: "1" } });
        fireEvent.change(await screen.findByLabelText("shipping.ward"), { target: { value: "2" } });
        fireEvent.change(await screen.findByLabelText("shipping.service"), { target: { value: "3" } });
        fireEvent.click(screen.getByRole("button", { name: "shipping.getQuote" }));

        await waitFor(() => expect(onQuoteChange).toHaveBeenLastCalledWith(expect.any(Object), expect.objectContaining({ id: "q-expiring" })));
        await waitFor(() => expect(onQuoteChange).toHaveBeenLastCalledWith(null, null), { timeout: 1000 });
        expect(screen.getByRole("button", { name: "shipping.getQuote" })).toBeEnabled();
    });
});
