import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { MemoryRouter } from "react-router-dom";
import CartItem from "../CartItem";
import { CartValidationIssue } from "../../../features/orders/types";
import { LocaleProvider, useLocale } from "../../../context/LocaleContext";

const LOCALE_STORAGE_KEY = "digital-e:locale:v1";

vi.mock("../../../utils/loadImage", () => ({
    default: (imageUrl: string | null, alt: string) => (
        <img src={imageUrl ?? "placeholder"} alt={alt} data-testid="load-image" />
    ),
}));

const LocaleToggle = () => {
    const { setLocale } = useLocale();
    return <button type="button" onClick={() => setLocale("vi")}>Switch to Vietnamese</button>;
};
const renderWithLocale = (ui: React.ReactElement) =>
    render(<MemoryRouter><LocaleProvider>{ui}</LocaleProvider></MemoryRouter>);

beforeEach(() => {
    window.localStorage.removeItem(LOCALE_STORAGE_KEY);
});

afterEach(() => {
    window.localStorage.removeItem(LOCALE_STORAGE_KEY);
});

const baseItem = {
    cartItemId: 42,
    productId: 7,
    productName: "Apple iPhone 13",
    category: "Smartphone",
    brand: "Apple",
    price: 999.0,
    sale_price: 899.0,
    main_image: "apple-iphone-13.jpg",
    quantity: 2,
    stock: 10,
};

describe("CartItem", () => {
    it("links the product name to its detail page and enables a numeric mobile input", () => {
        renderWithLocale(
            <CartItem
                item={baseItem}
                handleQuantityChange={vi.fn()}
                handleRemoveCartItem={vi.fn()}
            />
        );

        expect(screen.getByRole("link", { name: "Apple iPhone 13" })).toHaveAttribute(
            "href",
            "/product?id=7",
        );
        expect(screen.getByLabelText("cart-42-quantity")).toHaveAttribute("inputmode", "numeric");
    });

    it("localizes item action labels for Vietnamese", () => {
        render(
            <MemoryRouter>
                <LocaleProvider>
                    <LocaleToggle />
                    <CartItem
                        item={baseItem}
                        handleQuantityChange={vi.fn()}
                        handleRemoveCartItem={vi.fn()}
                    />
                </LocaleProvider>
            </MemoryRouter>,
        );

        fireEvent.click(screen.getByRole("button", { name: "Switch to Vietnamese" }));

        expect(screen.getByRole("link", { name: "Xem Apple iPhone 13" })).toBeInTheDocument();
        expect(screen.getByRole("group", { name: "Điều chỉnh số lượng cho Apple iPhone 13" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Xoá Apple iPhone 13 khỏi giỏ hàng" })).toBeInTheDocument();
    });
    it("renders brand, product name and category", () => {
        renderWithLocale(
            <CartItem
                item={baseItem}
                handleQuantityChange={vi.fn()}
                handleRemoveCartItem={vi.fn()}
            />
        );

        expect(screen.getByText("Apple")).toBeInTheDocument();
        expect(screen.getByText("Apple iPhone 13")).toBeInTheDocument();
        expect(screen.getByText("Smartphone")).toBeInTheDocument();
    });

    it("uses sale_price when present for the line total", () => {
        renderWithLocale(
            <CartItem
                item={baseItem}
                handleQuantityChange={vi.fn()}
                handleRemoveCartItem={vi.fn()}
            />
        );

        expect(screen.getByText(/1\.798\s+₫/)).toBeInTheDocument();
        expect(screen.getByText(/899\s+₫\s+each/)).toBeInTheDocument();
    });

    it("falls back to price when sale_price is null", () => {
        renderWithLocale(
            <CartItem
                item={{ ...baseItem, sale_price: null }}
                handleQuantityChange={vi.fn()}
                handleRemoveCartItem={vi.fn()}
            />
        );

        expect(screen.getByText(/1\.998\s+₫/)).toBeInTheDocument();
        expect(screen.getByText(/999\s+₫\s+each/)).toBeInTheDocument();
    });

    it("strips .jpg from main_image when building image URL", () => {
        renderWithLocale(
            <CartItem
                item={baseItem}
                handleQuantityChange={vi.fn()}
                handleRemoveCartItem={vi.fn()}
            />
        );

        const img = screen.getByTestId("load-image");
        expect(img).toHaveAttribute("src", "apple-iphone-13");
    });

    it("uses placeholder when main_image is empty", () => {
        renderWithLocale(
            <CartItem
                item={{ ...baseItem, main_image: "" }}
                handleQuantityChange={vi.fn()}
                handleRemoveCartItem={vi.fn()}
            />
        );

        const img = screen.getByTestId("load-image");
        expect(img).toHaveAttribute("src", "placeholder");
    });

    it("applies is-invalid class when a validation issue is present", () => {
        const { container } = renderWithLocale(
            <CartItem
                item={baseItem}
                validationIssue={{ reason: "out_of_stock", availableStock: 0 } as CartValidationIssue}
                handleQuantityChange={vi.fn()}
                handleRemoveCartItem={vi.fn()}
            />
        );

        expect(container.querySelector(".cart-item.is-invalid")).toBeInTheDocument();
        expect(screen.getAllByText("Out of stock. Remove this item to continue.").length).toBeGreaterThan(0);
    });

    it("renders the unavailable message when reason is unavailable", () => {
        renderWithLocale(
            <CartItem
                item={baseItem}
                validationIssue={{ reason: "unavailable" } as CartValidationIssue}
                handleQuantityChange={vi.fn()}
                handleRemoveCartItem={vi.fn()}
            />
        );

        expect(screen.getAllByText("No longer available. Remove this item to continue.").length).toBeGreaterThan(0);
    });

    it("renders the insufficient stock message with available count", () => {
        renderWithLocale(
            <CartItem
                item={baseItem}
                validationIssue={{ reason: "insufficient_stock", availableStock: 3 } as CartValidationIssue}
                handleQuantityChange={vi.fn()}
                handleRemoveCartItem={vi.fn()}
            />
        );

        expect(screen.getAllByText("Only 3 item(s) available.").length).toBeGreaterThan(0);
    });

    it("shows low stock hint when stock is between 1 and 5", () => {
        renderWithLocale(
            <CartItem
                item={{ ...baseItem, stock: 3 }}
                handleQuantityChange={vi.fn()}
                handleRemoveCartItem={vi.fn()}
            />
        );

        expect(screen.getByText("3 left")).toBeInTheDocument();
    });

    it("does not show low stock hint when stock is above 5", () => {
        renderWithLocale(
            <CartItem
                item={baseItem}
                handleQuantityChange={vi.fn()}
                handleRemoveCartItem={vi.fn()}
            />
        );

        expect(screen.queryByText(/\d+ left/)).not.toBeInTheDocument();
    });

    it("calls handleQuantityChange with the cartItemId and the event", () => {
        const onQuantityChange = vi.fn();
        renderWithLocale(
            <CartItem
                item={baseItem}
                handleQuantityChange={onQuantityChange}
                handleRemoveCartItem={vi.fn()}
            />
        );

        const input = screen.getByLabelText("cart-42-quantity") as HTMLInputElement;
        fireEvent.change(input, { target: { value: "5" } });

        expect(onQuantityChange).toHaveBeenCalledTimes(1);
        const [cartItemId, event] = onQuantityChange.mock.calls[0];
        expect(cartItemId).toBe(42);
        expect(event).toBeDefined();
        expect(event.type).toBe("change");
    });

    it("calls handleRemoveCartItem when the remove button is clicked", () => {
        const onRemove = vi.fn();
        renderWithLocale(
            <CartItem
                item={baseItem}
                handleQuantityChange={vi.fn()}
                handleRemoveCartItem={onRemove}
            />
        );

        fireEvent.click(screen.getByRole("button", { name: /Remove Apple iPhone 13 from cart/i }));
        expect(onRemove).toHaveBeenCalledWith(42);
    });

    it("clamps the max attribute to at least 1 even when stock is 0", () => {
        renderWithLocale(
            <CartItem
                item={{ ...baseItem, stock: 0 }}
                handleQuantityChange={vi.fn()}
                handleRemoveCartItem={vi.fn()}
            />
        );

        const input = screen.getByLabelText("cart-42-quantity") as HTMLInputElement;
        expect(input.max).toBe("1");
    });

    it("uses available stock after active reservations as the quantity cap", () => {
        renderWithLocale(
            <CartItem
                item={{ ...baseItem, available_stock: 3 }}
                handleQuantityChange={vi.fn()}
                handleRemoveCartItem={vi.fn()}
            />
        );

        const input = screen.getByLabelText("cart-42-quantity") as HTMLInputElement;
        expect(input.max).toBe("3");
    });
});
