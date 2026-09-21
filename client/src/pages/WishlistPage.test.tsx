import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import WishlistPage from "./WishlistPage";
import { LocaleProvider } from "../context/LocaleContext";

const mocks = vi.hoisted(() => ({
    axios: {
        get: vi.fn(),
        delete: vi.fn(),
        post: vi.fn(),
    },
    alerts: {
        fetchProductAlerts: vi.fn(),
        updateProductAlert: vi.fn(),
    },
    auth: {
        userData: { id: "user-1" },
    },
    toast: {
        addToast: vi.fn(),
    },
}));

vi.mock("../api/axios", () => ({ default: mocks.axios }));

vi.mock("../features/productAlerts/api", () => mocks.alerts);

vi.mock("../context/AuthContext", () => ({
    useAuth: () => mocks.auth,
}));

vi.mock("../context/ToastContext", () => ({
    useToast: () => mocks.toast,
}));

vi.mock("../components/layout/Layout", () => ({
    default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("../components/common/LoadingScreen", () => ({
    default: () => <div>Loading</div>,
}));

vi.mock("../components/common/EmptyState", () => ({
    default: () => <div>Empty wishlist</div>,
}));

vi.mock("../components/common/ConfirmActionModal", () => ({
    default: ({ show, onConfirm }: { show: boolean; onConfirm: () => void }) =>
        show ? <button type="button" onClick={onConfirm}>Confirm remove</button> : null,
}));

vi.mock("../components/common/WishlistItem", () => ({
    default: ({
        item,
        alertPreference,
        onAlertToggle,
        onRemoveWishlist,
    }: {
        item: { product: { id: number; name: string } };
        alertPreference: { priceDropEnabled: boolean; backInStockEnabled: boolean };
        onAlertToggle: (productId: number, key: "priceDropEnabled" | "backInStockEnabled", enabled: boolean) => void;
        onRemoveWishlist: (productId: number) => void;
    }) => (
        <article data-testid={`wishlist-${item.product.id}`}>
            <span>{item.product.name}</span>
            <button
                type="button"
                role="switch"
                aria-label="Price drop"
                aria-checked={alertPreference.priceDropEnabled}
                onClick={() => onAlertToggle(item.product.id, "priceDropEnabled", !alertPreference.priceDropEnabled)}
            />
            <button
                type="button"
                role="switch"
                aria-label="Back in stock"
                aria-checked={alertPreference.backInStockEnabled}
                onClick={() => onAlertToggle(item.product.id, "backInStockEnabled", !alertPreference.backInStockEnabled)}
            />
            <button type="button" onClick={() => onRemoveWishlist(item.product.id)}>
                Remove {item.product.name}
            </button>
        </article>
    ),
}));

vi.mock("react-helmet-async", () => ({
    Helmet: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const wishlistResponse = {
    status: 200,
    data: {
        wishlist: [
            {
                id: 101,
                product_id: 1,
                name: "GPU One",
                brand: "Digital-E",
                category: "Components",
                price: 100,
                sale_price: null,
                stock: 3,
                main_image: null,
            },
            {
                id: 102,
                product_id: 2,
                name: "GPU Two",
                brand: "Digital-E",
                category: "Components",
                price: 200,
                sale_price: null,
                stock: 0,
                main_image: null,
            },
        ],
    },
};

describe("Wishlist alert controls", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.axios.get.mockResolvedValue(wishlistResponse);
        mocks.axios.delete.mockResolvedValue({ status: 200, data: {} });
        mocks.axios.post.mockResolvedValue({ status: 200, data: {} });
        mocks.alerts.fetchProductAlerts.mockResolvedValue([
            { productId: 1, priceDropEnabled: true, backInStockEnabled: false },
            { productId: 2, priceDropEnabled: false, backInStockEnabled: true },
        ]);
        mocks.alerts.updateProductAlert.mockImplementation(async (_uid: string, productId: number, input: object) => ({
            productId,
            ...input,
        }));
    });

    const renderWishlist = () => render(
        <MemoryRouter>
            <LocaleProvider>
                <WishlistPage />
            </LocaleProvider>
        </MemoryRouter>,
    );

    it("loads alert preferences once and maps them to each wishlist row", async () => {
        renderWishlist();

        expect(await screen.findByTestId("wishlist-1")).toBeInTheDocument();
        expect(mocks.alerts.fetchProductAlerts).toHaveBeenCalledTimes(1);
        expect(mocks.alerts.fetchProductAlerts).toHaveBeenCalledWith("user-1");
        expect(screen.getAllByRole("switch", { name: "Price drop" })[0]).toHaveAttribute("aria-checked", "true");
        expect(screen.getAllByRole("switch", { name: "Price drop" })[1]).toHaveAttribute("aria-checked", "false");
        expect(screen.getAllByRole("switch", { name: "Back in stock" })[1]).toHaveAttribute("aria-checked", "true");
    });

    it("updates one row without changing another row's alert state", async () => {
        renderWishlist();

        const backInStockSwitches = await screen.findAllByRole("switch", { name: "Back in stock" });
        fireEvent.click(backInStockSwitches[1]);

        await waitFor(() => expect(mocks.alerts.updateProductAlert).toHaveBeenCalledWith("user-1", 2, {
            priceDropEnabled: false,
            backInStockEnabled: false,
        }));
        expect(screen.getAllByRole("switch", { name: "Price drop" })[0]).toHaveAttribute("aria-checked", "true");
        expect(screen.getAllByRole("switch", { name: "Back in stock" })[0]).toHaveAttribute("aria-checked", "false");
    });

    it("keeps alert state in the local model when a wishlist item is removed", async () => {
        renderWishlist();

        fireEvent.click(await screen.findByRole("button", { name: "Remove GPU One" }));
        fireEvent.click(screen.getByRole("button", { name: "Confirm remove" }));

        await waitFor(() => expect(screen.queryByTestId("wishlist-1")).not.toBeInTheDocument());
        expect(mocks.alerts.fetchProductAlerts).toHaveBeenCalledTimes(1);
        expect(screen.getByTestId("wishlist-2")).toBeInTheDocument();
        expect(screen.getByRole("switch", { name: "Back in stock" })).toHaveAttribute("aria-checked", "true");
    });
});
