import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { addGuestCartItem, clearGuestCart, readGuestCart } from "../../features/orders/guestCartStorage";
import type { CheckoutCartItem, GuestCartPreview } from "../../features/orders/types";
import { CartProvider, useCart } from "../CartContext";

const mocks = vi.hoisted(() => ({
    auth: { userData: null as { id: string } | null, loading: false },
    addToast: vi.fn(),
    fetchCustomerCart: vi.fn(),
    updateCustomerCartItem: vi.fn(),
    removeCustomerCartItem: vi.fn(),
    validateCustomerCart: vi.fn(),
    applyCustomerDiscount: vi.fn(),
    previewGuestCart: vi.fn(),
    addItemsToCustomerCart: vi.fn(),
}));

vi.mock("../AuthContext", () => ({
    useAuth: () => mocks.auth,
}));

vi.mock("../ToastContext", () => ({
    useToast: () => ({ addToast: mocks.addToast }),
}));

vi.mock("../../features/orders/api", () => ({
    fetchCustomerCart: mocks.fetchCustomerCart,
    updateCustomerCartItem: mocks.updateCustomerCartItem,
    removeCustomerCartItem: mocks.removeCustomerCartItem,
    validateCustomerCart: mocks.validateCustomerCart,
    applyCustomerDiscount: mocks.applyCustomerDiscount,
    previewGuestCart: mocks.previewGuestCart,
    addItemsToCustomerCart: mocks.addItemsToCustomerCart,
}));

const serverItem = (overrides: Partial<CheckoutCartItem> = {}): CheckoutCartItem => ({
    cartItemId: 7,
    productId: 10,
    productName: "Widget",
    category: "Components",
    brand: "Digital-E",
    price: 100,
    sale_price: null,
    main_image: "widget.jpg",
    quantity: 2,
    stock: 5,
    available_stock: 5,
    ...overrides,
});

const preview = (overrides: Partial<GuestCartPreview> = {}): GuestCartPreview => ({
    valid: true,
    cartItems: [serverItem({ cartItemId: 0 })],
    issues: [],
    merchandiseTotal: 200,
    promotion: { code: null, valid: false, discount: 0, discountPercent: null },
    totalPrice: 200,
    ...overrides,
});

const Probe = () => {
    const cart = useCart();
    return (
        <div>
            <span data-testid="status">{cart.status}</span>
            <span data-testid="error">{cart.error || ""}</span>
            <span data-testid="items">{cart.items.length}</span>
            <span data-testid="total">{cart.totalPrice}</span>
            <span data-testid="merge-available">{String(cart.hasGuestItems)}</span>
            <button onClick={() => void cart.addItem(10, 2)}>add</button>
            <button onClick={() => void cart.updateQuantity(cart.items[0]?.cartItemId || 10, 3)}>update</button>
            <button onClick={() => cart.items[0] && cart.removeItem(cart.items[0])}>remove</button>
            <button onClick={() => void cart.confirmRemoveItem()}>confirm-remove</button>
            <button onClick={() => void cart.applyDiscount("SAVE10", 200)}>discount</button>
            <button onClick={() => void cart.mergeGuestCart()}>merge</button>
            <button onClick={() => void cart.fetchCart()}>refresh</button>
        </div>
    );
};

const renderCart = () => render(<CartProvider><Probe /></CartProvider>);

describe("CartContext dual-source state", () => {
    beforeEach(() => {
        clearGuestCart();
        mocks.auth.userData = null;
        mocks.auth.loading = false;
        mocks.addToast.mockReset();
        mocks.fetchCustomerCart.mockReset();
        mocks.updateCustomerCartItem.mockReset();
        mocks.removeCustomerCartItem.mockReset();
        mocks.validateCustomerCart.mockReset();
        mocks.applyCustomerDiscount.mockReset();
        mocks.previewGuestCart.mockReset();
        mocks.addItemsToCustomerCart.mockReset();
        mocks.previewGuestCart.mockResolvedValue(preview());
        mocks.fetchCustomerCart.mockResolvedValue([]);
        mocks.updateCustomerCartItem.mockResolvedValue(undefined);
        mocks.removeCustomerCartItem.mockResolvedValue(undefined);
        mocks.validateCustomerCart.mockResolvedValue({ valid: true, cartItems: [], issues: [] });
        mocks.applyCustomerDiscount.mockResolvedValue({ newPrice: 180 });
        mocks.addItemsToCustomerCart.mockResolvedValue(undefined);
    });

    it("loads a guest preview as ready state and keeps server-derived totals", async () => {
        addGuestCartItem({ productId: 10, quantity: 2 });

        renderCart();

        await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("ready"));
        expect(screen.getByTestId("items")).toHaveTextContent("1");
        expect(screen.getByTestId("total")).toHaveTextContent("200");
        expect(mocks.previewGuestCart).toHaveBeenCalledWith([{ productId: 10, quantity: 2 }], undefined);
    });

    it("exposes a recoverable error instead of treating a failed preview as empty", async () => {
        addGuestCartItem({ productId: 10, quantity: 2 });
        mocks.previewGuestCart.mockRejectedValue(new Error("preview unavailable"));

        renderCart();

        await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("error"));
        expect(screen.getByTestId("items")).toHaveTextContent("0");
        expect(screen.getByTestId("error")).toHaveTextContent("Unable to load cart right now.");
        expect(readGuestCart()).toEqual([{ productId: 10, quantity: 2 }]);
        expect(screen.getByTestId("status")).not.toHaveTextContent("empty");
    });

    it("updates guest storage through one add and update flow before refreshing preview", async () => {
        renderCart();
        await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("empty"));

        fireEvent.click(screen.getByText("add"));
        await waitFor(() => expect(readGuestCart()).toEqual([{ productId: 10, quantity: 2 }]));

        fireEvent.click(screen.getByText("update"));
        await waitFor(() => expect(readGuestCart()).toEqual([{ productId: 10, quantity: 3 }]));
        expect(mocks.previewGuestCart.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    it("removes a guest item through the confirmed context flow", async () => {
        addGuestCartItem({ productId: 10, quantity: 2 });
        renderCart();
        await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("ready"));

        fireEvent.click(screen.getByText("remove"));
        fireEvent.click(screen.getByText("confirm-remove"));

        await waitFor(() => expect(readGuestCart()).toEqual([]));
        expect(screen.getByTestId("status")).toHaveTextContent("empty");
    });

    it("surfaces authoritative guest validation issues as a non-empty state", async () => {
        addGuestCartItem({ productId: 10, quantity: 2 });
        mocks.previewGuestCart.mockResolvedValueOnce(preview({
            valid: false,
            issues: [{
                productId: 10,
                productName: "Widget",
                requestedQuantity: 2,
                availableStock: 1,
                reason: "insufficient_stock",
            }],
        }));

        renderCart();

        await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("validation-error"));
        expect(screen.getByTestId("items")).toHaveTextContent("1");
        expect(screen.getByTestId("status")).not.toHaveTextContent("empty");
    });

    it("validates a guest discount through preview", async () => {
        addGuestCartItem({ productId: 10, quantity: 2 });
        renderCart();
        await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("ready"));
        mocks.previewGuestCart.mockResolvedValueOnce(preview({
            promotion: { code: "SAVE10", valid: true, discount: 20, discountPercent: 10 },
            totalPrice: 180,
        }));

        fireEvent.click(screen.getByText("discount"));

        await waitFor(() => expect(mocks.previewGuestCart).toHaveBeenLastCalledWith(
            [{ productId: 10, quantity: 2 }],
            "SAVE10",
        ));
    });

    it("keeps authenticated cart reads and mutations on authenticated endpoints", async () => {
        mocks.auth.userData = { id: "user-1" };
        mocks.fetchCustomerCart.mockResolvedValue([serverItem()]);

        renderCart();

        await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("ready"));
        expect(mocks.fetchCustomerCart).toHaveBeenCalledWith("user-1");
        expect(mocks.previewGuestCart).not.toHaveBeenCalled();

        fireEvent.click(screen.getByText("update"));
        await waitFor(() => expect(mocks.updateCustomerCartItem).toHaveBeenCalledWith("user-1", 7, 3));
        expect(readGuestCart()).toEqual([]);
    });

    it("merges accepted guest items while retaining rejected items for retry", async () => {
        mocks.auth.userData = { id: "user-1" };
        addGuestCartItem({ productId: 10, quantity: 2 });
        addGuestCartItem({ productId: 11, quantity: 1 });
        mocks.addItemsToCustomerCart
            .mockResolvedValueOnce(undefined)
            .mockRejectedValueOnce(new Error("out of stock"));

        renderCart();
        await waitFor(() => expect(screen.getByTestId("merge-available")).toHaveTextContent("true"));

        fireEvent.click(screen.getByText("merge"));
        await waitFor(() => expect(readGuestCart()).toEqual([{ productId: 11, quantity: 1 }]));
        expect(screen.getByTestId("error")).toHaveTextContent("Some guest cart items could not be merged.");
        expect(mocks.addItemsToCustomerCart).toHaveBeenNthCalledWith(1, "user-1", [
            { productId: 10, quantity: 2, stock: 2 },
        ]);
        expect(mocks.addItemsToCustomerCart).toHaveBeenNthCalledWith(2, "user-1", [
            { productId: 11, quantity: 1, stock: 1 },
        ]);

        mocks.addItemsToCustomerCart.mockResolvedValueOnce(undefined);
        fireEvent.click(screen.getByText("merge"));
        await waitFor(() => expect(readGuestCart()).toEqual([]));
    });

    it("does not copy an authenticated cart into guest storage across logout", async () => {
        mocks.auth.userData = { id: "user-1" };
        mocks.fetchCustomerCart.mockResolvedValue([serverItem({ productId: 99 })]);
        const view = renderCart();

        await waitFor(() => expect(screen.getByTestId("items")).toHaveTextContent("1"));
        act(() => {
            mocks.auth.userData = null;
            addGuestCartItem({ productId: 10, quantity: 1 });
            view.rerender(<CartProvider><Probe /></CartProvider>);
        });

        await waitFor(() => expect(mocks.previewGuestCart).toHaveBeenCalledWith([{ productId: 10, quantity: 1 }], undefined));
        expect(readGuestCart()).toEqual([{ productId: 10, quantity: 1 }]);
    });
});
