import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import WishlistPage from "./WishlistPage";
import { LocaleProvider } from "../context/LocaleContext";

const mocks = vi.hoisted(() => ({
    productsApi: {
        fetchWishlist: vi.fn(),
        removeFromWishlist: vi.fn(),
        removeWishlistItems: vi.fn(),
    },
    ordersApi: {
        addItemsToCustomerCart: vi.fn(),
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

vi.mock("../features/products/api", () => mocks.productsApi);
vi.mock("../features/orders/api", () => mocks.ordersApi);
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
    default: ({ title, description, actionLabel }: { title: string; description?: string; actionLabel?: string }) => (
        <div>
            <h2>{title}</h2>
            {description ? <p>{description}</p> : null}
            {actionLabel ? <span>{actionLabel}</span> : null}
        </div>
    ),
}));

vi.mock("../components/common/ConfirmActionModal", () => ({
    default: ({
        show,
        title,
        message,
        confirmLabel,
        cancelLabel,
        processingLabel,
        onConfirm,
        onCancel,
    }: {
        show: boolean;
        title: string;
        message: string;
        confirmLabel: string;
        cancelLabel: string;
        processingLabel: string;
        onConfirm: () => void;
        onCancel: () => void;
    }) => show ? (
        <div role="dialog" aria-label={title} data-processing-label={processingLabel}>
            <h2>{title}</h2>
            <p>{message}</p>
            <button type="button" onClick={onConfirm}>{confirmLabel}</button>
            <button type="button" onClick={onCancel}>{cancelLabel}</button>
        </div>
    ) : null,
}));

vi.mock("../components/common/WishlistItem", () => ({
    default: ({
        item,
        alertPreference,
        alertPreferencesLoaded,
        onAlertToggle,
        onRemoveWishlist,
    }: {
        item: { product: { id: number; name: string } };
        alertPreference?: { priceDropEnabled: boolean; backInStockEnabled: boolean };
        alertPreferencesLoaded?: boolean;
        onAlertToggle: (productId: number, key: "priceDropEnabled" | "backInStockEnabled", enabled: boolean) => void;
        onRemoveWishlist: (productId: number) => void;
    }) => (
        <article data-testid={`wishlist-${item.product.id}`}>
            <span>{item.product.name}</span>
            <button
                type="button"
                role="switch"
                aria-label="Price drop"
                aria-checked={alertPreference?.priceDropEnabled ?? false}
                disabled={alertPreferencesLoaded === false}
                onClick={() => onAlertToggle(item.product.id, "priceDropEnabled", !(alertPreference?.priceDropEnabled ?? false))}
            />
            <button
                type="button"
                role="switch"
                aria-label="Back in stock"
                aria-checked={alertPreference?.backInStockEnabled ?? false}
                disabled={alertPreferencesLoaded === false}
                onClick={() => onAlertToggle(item.product.id, "backInStockEnabled", !(alertPreference?.backInStockEnabled ?? false))}
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

const wishlist = [
    { id: 101, product: { id: 1, name: "GPU One", stock: 3 } },
    { id: 102, product: { id: 2, name: "GPU Two", stock: 0 } },
];

describe("Wishlist alert controls", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.localStorage.clear();
        mocks.productsApi.fetchWishlist.mockResolvedValue(wishlist);
        mocks.productsApi.removeFromWishlist.mockResolvedValue(undefined);
        mocks.productsApi.removeWishlistItems.mockResolvedValue(undefined);
        mocks.ordersApi.addItemsToCustomerCart.mockResolvedValue(undefined);
        mocks.alerts.fetchProductAlerts.mockResolvedValue([
            { productId: 1, priceDropEnabled: true, backInStockEnabled: false },
            { productId: 2, priceDropEnabled: false, backInStockEnabled: true },
        ]);
        mocks.alerts.updateProductAlert.mockImplementation(async (_uid: string, productId: number, input: object) => ({
            productId,
            ...input,
        }));
    });

    const renderWishlist = (locale: "en" | "vi" = "en") => {
        window.localStorage.setItem("digital-e:locale:v1", JSON.stringify(locale));
        return render(
            <MemoryRouter>
                <LocaleProvider>
                    <WishlistPage />
                </LocaleProvider>
            </MemoryRouter>,
        );
    };

    it.each([
        { locale: "en" as const, title: "Wishlist", saved: "Saved", selected: "Selected", available: "Available", bulkActions: "Wishlist bulk actions", select: "Select all", move: "Move selected", remove: "Remove selected" },
        { locale: "vi" as const, title: "Danh sách yêu thích", saved: "Đã lưu", selected: "Đã chọn", available: "Còn hàng", bulkActions: "Thao tác hàng loạt trong danh sách yêu thích", select: "Chọn tất cả", move: "Chuyển sản phẩm đã chọn", remove: "Xóa sản phẩm đã chọn" },
    ])("localizes the wishlist page and bulk actions in $locale", async ({ locale, title, saved, selected, available, bulkActions, select, move, remove }) => {
        renderWishlist(locale);

        expect(await screen.findByRole("heading", { level: 1, name: title })).toBeInTheDocument();
        expect(screen.getByText(saved)).toBeInTheDocument();
        expect(screen.getByText(selected)).toBeInTheDocument();
        expect(screen.getByText(available)).toBeInTheDocument();
        expect(screen.getByRole("region", { name: bulkActions })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: select })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: move })).toBeDisabled();
        expect(screen.getByRole("button", { name: remove })).toBeDisabled();
    });

    it("localizes the empty state and singular removal confirmation in Vietnamese", async () => {
        mocks.productsApi.fetchWishlist.mockResolvedValueOnce([]);
        renderWishlist("vi");

        expect(await screen.findByRole("heading", { name: "Danh sách yêu thích đang trống" })).toBeInTheDocument();
        expect(screen.getByText("Lưu sản phẩm bạn đang cân nhắc và quay lại khi sẵn sàng lựa chọn.")).toBeInTheDocument();
        expect(screen.getByText("Xem sản phẩm")).toBeInTheDocument();

        mocks.productsApi.fetchWishlist.mockResolvedValueOnce([wishlist[0]]);
        renderWishlist("vi");
        fireEvent.click(await screen.findByRole("button", { name: "Remove GPU One" }));

        expect(screen.getByRole("dialog", { name: "Xóa sản phẩm khỏi danh sách yêu thích" })).toHaveTextContent(
            'Xóa "GPU One" khỏi danh sách yêu thích?',
        );
    });

    it.each([
        { locale: "en" as const, items: wishlist, selectAll: "Select all", removeSelected: "Remove selected", dialog: "Remove selected items", message: "Remove 2 selected items from your wishlist?", processing: "Processing..." },
        { locale: "en" as const, items: [wishlist[0]], selectAll: "Select all", removeSelected: "Remove selected", dialog: "Remove selected items", message: "Remove 1 selected item from your wishlist?", processing: "Processing..." },
        { locale: "vi" as const, items: wishlist, selectAll: "Chọn tất cả", removeSelected: "Xóa sản phẩm đã chọn", dialog: "Xóa sản phẩm đã chọn", message: "Xóa 2 sản phẩm đã chọn khỏi danh sách yêu thích?", processing: "Đang xử lý..." },
        { locale: "vi" as const, items: [wishlist[0]], selectAll: "Chọn tất cả", removeSelected: "Xóa sản phẩm đã chọn", dialog: "Xóa sản phẩm đã chọn", message: "Xóa 1 sản phẩm đã chọn khỏi danh sách yêu thích?", processing: "Đang xử lý..." },
    ])("localizes singular and plural bulk-removal confirmation in $locale", async ({ locale, items, selectAll, removeSelected, dialog, message, processing }) => {
        mocks.productsApi.fetchWishlist.mockResolvedValueOnce(items);
        renderWishlist(locale);
        await screen.findByTestId("wishlist-1");

        fireEvent.click(screen.getByRole("button", { name: selectAll }));
        fireEvent.click(screen.getByRole("button", { name: removeSelected }));

        expect(screen.getByRole("dialog", { name: dialog })).toHaveTextContent(message);
        expect(screen.getByRole("dialog", { name: dialog })).toHaveAttribute("data-processing-label", processing);
    });

    it.each([
        { locale: "en" as const, message: "Unable to load wishlist." },
        { locale: "vi" as const, message: "Không thể tải danh sách yêu thích." },
    ])("localizes wishlist loading feedback in $locale", async ({ locale, message }) => {
        mocks.productsApi.fetchWishlist.mockRejectedValueOnce(new Error("unavailable"));
        renderWishlist(locale);

        await waitFor(() => expect(mocks.toast.addToast).toHaveBeenCalledWith(
            locale === "en" ? "Wishlist" : "Danh sách yêu thích",
            message,
            "error",
        ));
    });

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
        fireEvent.click(screen.getByRole("button", { name: "Remove" }));

        await waitFor(() => expect(screen.queryByTestId("wishlist-1")).not.toBeInTheDocument());
        expect(mocks.alerts.fetchProductAlerts).toHaveBeenCalledTimes(1);
        expect(screen.getByTestId("wishlist-2")).toBeInTheDocument();
        expect(screen.getByRole("switch", { name: "Back in stock" })).toHaveAttribute("aria-checked", "true");
        expect(mocks.toast.addToast).toHaveBeenCalledWith("Wishlist", "Item removed from wishlist.", "success");
    });

    it("shows an alert loading error and retries without blocking the wishlist", async () => {
        mocks.alerts.fetchProductAlerts
            .mockRejectedValueOnce(new Error("unavailable"))
            .mockResolvedValueOnce([]);

        renderWishlist();

        expect(await screen.findByTestId("wishlist-1")).toBeInTheDocument();
        expect(await screen.findByRole("alert")).toHaveTextContent("Unable to load product alerts.");

        fireEvent.click(screen.getByRole("button", { name: "Retry product alerts" }));

        await waitFor(() => expect(mocks.alerts.fetchProductAlerts).toHaveBeenCalledTimes(2));
        await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    });

    it("keeps alert controls unavailable after preference loading fails", async () => {
        mocks.alerts.fetchProductAlerts.mockRejectedValueOnce(new Error("unavailable"));

        renderWishlist();

        expect(await screen.findByTestId("wishlist-1")).toBeInTheDocument();
        expect(await screen.findByRole("alert")).toHaveTextContent("Unable to load product alerts.");
        expect(screen.getAllByRole("switch", { name: "Price drop" })[0]).toBeDisabled();
        expect(screen.getAllByRole("switch", { name: "Back in stock" })[0]).toBeDisabled();

        fireEvent.click(screen.getAllByRole("switch", { name: "Back in stock" })[0]);
        expect(mocks.alerts.updateProductAlert).not.toHaveBeenCalled();
    });
});
