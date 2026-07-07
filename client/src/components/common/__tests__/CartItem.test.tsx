import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import CartItem from "../CartItem";
import { CartValidationIssue } from "../../../features/orders/types";

vi.mock("../../../utils/loadImage", () => ({
    default: (imageUrl: string | null, alt: string) => (
        <img src={imageUrl ?? "placeholder"} alt={alt} data-testid="load-image" />
    ),
}));

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
    it("renders brand, product name and category", () => {
        render(
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
        render(
            <CartItem
                item={baseItem}
                handleQuantityChange={vi.fn()}
                handleRemoveCartItem={vi.fn()}
            />
        );

        expect(screen.getByText("$1798.00")).toBeInTheDocument();
        expect(screen.getByText("$899.00 each")).toBeInTheDocument();
    });

    it("falls back to price when sale_price is null", () => {
        render(
            <CartItem
                item={{ ...baseItem, sale_price: null }}
                handleQuantityChange={vi.fn()}
                handleRemoveCartItem={vi.fn()}
            />
        );

        expect(screen.getByText("$1998.00")).toBeInTheDocument();
        expect(screen.getByText("$999.00 each")).toBeInTheDocument();
    });

    it("strips .jpg from main_image when building image URL", () => {
        render(
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
        render(
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
        const { container } = render(
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
        render(
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
        render(
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
        render(
            <CartItem
                item={{ ...baseItem, stock: 3 }}
                handleQuantityChange={vi.fn()}
                handleRemoveCartItem={vi.fn()}
            />
        );

        expect(screen.getByText("3 left")).toBeInTheDocument();
    });

    it("does not show low stock hint when stock is above 5", () => {
        render(
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
        render(
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
        render(
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
        render(
            <CartItem
                item={{ ...baseItem, stock: 0 }}
                handleQuantityChange={vi.fn()}
                handleRemoveCartItem={vi.fn()}
            />
        );

        const input = screen.getByLabelText("cart-42-quantity") as HTMLInputElement;
        expect(input.max).toBe("1");
    });
});
