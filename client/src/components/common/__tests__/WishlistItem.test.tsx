import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "../../../context/LocaleContext";
import type { Product } from "../../../types/product";
import { formatCurrency } from "../../../utils/currency";
import WishlistItem from "../WishlistItem";

vi.mock("../../../features/productAlerts/components/ProductAlertControls", () => ({
    default: () => null,
}));

const product: Product = {
    id: 71,
    name: "Studio Headphones",
    sku: "AUDIO-71",
    manufacturerPartNumber: null,
    warrantyMonths: 24,
    category: "Audio",
    brand: "Northstar Audio",
    price: 1_500_000,
    sale_price: 1_200_000,
    rating: 4.8,
    reviews: 31,
    main_image: null,
    stock: 3,
    available_stock: 3,
    description: "Product fixture description.",
    specifications: null,
};

const callbacks = {
    onSelect: vi.fn(),
    onMoveToCart: vi.fn(),
    onRemoveWishlist: vi.fn(),
};

const renderWishlistItem = (locale: "en" | "vi", itemProduct = product) => {
    window.localStorage.setItem("digital-e:locale:v1", JSON.stringify(locale));
    return render(
        <MemoryRouter>
            <LocaleProvider>
                <WishlistItem
                    item={{ id: 501, product: itemProduct }}
                    selected={false}
                    onSelect={callbacks.onSelect}
                    onMoveToCart={callbacks.onMoveToCart}
                    onRemoveWishlist={callbacks.onRemoveWishlist}
                />
            </LocaleProvider>
        </MemoryRouter>,
    );
};

describe("WishlistItem localization", () => {
    beforeEach(() => {
        window.localStorage.clear();
        vi.clearAllMocks();
    });

    it.each([
        { locale: "en" as const, select: "Select Studio Headphones", stock: "3 in stock", sale: "Sale from", available: "Available", move: "Move to cart", remove: "Remove Studio Headphones from wishlist" },
        { locale: "vi" as const, select: "Chọn Studio Headphones", stock: "Còn 3 sản phẩm", sale: "Giá gốc", available: "Còn hàng", move: "Chuyển vào giỏ hàng", remove: "Xóa Studio Headphones khỏi danh sách yêu thích" },
    ])("localizes row labels and actions in $locale while retaining product facts", ({ locale, select, stock, sale, available, move, remove }) => {
        renderWishlistItem(locale);

        expect(screen.getByRole("checkbox", { name: select })).toBeInTheDocument();
        expect(screen.getByText(stock)).toBeInTheDocument();
        expect(screen.getByText(sale, { exact: false })).toHaveTextContent(formatCurrency(product.price).replace(/\u00a0/g, " "));
        expect(screen.getByText(available)).toBeInTheDocument();
        expect(screen.getByRole("button", { name: move })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: remove })).toBeInTheDocument();
        expect(screen.getByText("Northstar Audio | Audio")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("checkbox", { name: select }));
        fireEvent.click(screen.getByRole("button", { name: move }));
        fireEvent.click(screen.getByRole("button", { name: remove }));
        expect(callbacks.onSelect).toHaveBeenCalledWith(product.id, true);
        expect(callbacks.onMoveToCart).toHaveBeenCalledWith(product);
        expect(callbacks.onRemoveWishlist).toHaveBeenCalledWith(product.id);
    });

    it("localizes out-of-stock status and disables the existing cart action", () => {
        renderWishlistItem("vi", { ...product, stock: 0, available_stock: 0, sale_price: null });

        expect(screen.getAllByText("Hết hàng")).toHaveLength(2);
        expect(screen.getByText("Giá không đổi")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Chuyển vào giỏ hàng" })).toBeDisabled();
    });
});
