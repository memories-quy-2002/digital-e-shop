import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "../../../context/LocaleContext";
import AsideCart from "../AsideCart";

vi.mock("../../../context/ToastContext", () => ({
    useToast: () => ({ addToast: vi.fn() }),
}));

describe("AsideCart", () => {
    it("presents a clear order summary and checkout action", () => {
        render(
            <LocaleProvider>
                <AsideCart
                    itemCount={2}
                    totalPrice={100000}
                    discount={10000}
                    subtotal={90000}
                    applyDiscount={vi.fn()}
                    onCheckout={vi.fn()}
                />
            </LocaleProvider>,
        );

        expect(screen.getByRole("heading", { name: "Order summary" })).toBeInTheDocument();
        expect(screen.getByText("Items subtotal")).toBeInTheDocument();
        expect(screen.getByText("Shipping calculated at checkout")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Proceed to checkout" })).toBeInTheDocument();
        expect(screen.queryByText("UTC order time")).not.toBeInTheDocument();
    });
});
