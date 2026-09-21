import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "../../../context/LocaleContext";
import ProductAlertControls from "./ProductAlertControls";

const preference = {
    productId: 7,
    priceDropEnabled: true,
    backInStockEnabled: false,
};

const renderControls = (props: Partial<React.ComponentProps<typeof ProductAlertControls>> = {}) =>
    render(
        <LocaleProvider>
            <ProductAlertControls
                preference={preference}
                onToggle={vi.fn()}
                {...props}
            />
        </LocaleProvider>,
    );

describe("ProductAlertControls", () => {
    it("renders labelled switches with the current preference state", () => {
        renderControls();

        expect(screen.getByRole("switch", { name: "Price drop" })).toHaveAttribute("aria-checked", "true");
        expect(screen.getByRole("switch", { name: "Back in stock" })).toHaveAttribute("aria-checked", "false");
        expect(screen.getByText("Get an in-app alert when the price moves lower.")).toBeInTheDocument();
        expect(screen.getByText("Get an in-app alert when this item returns.")).toBeInTheDocument();
    });

    it("calls onToggle with the selected alert type and next value", () => {
        const onToggle = vi.fn();
        renderControls({ onToggle });

        fireEvent.click(screen.getByRole("switch", { name: "Back in stock" }));

        expect(onToggle).toHaveBeenCalledWith("backInStockEnabled", true);
    });

    it("exposes saving state and a live error without relying on color alone", () => {
        renderControls({ saving: true, error: "Unable to save alerts." });

        expect(screen.getByRole("switch", { name: "Price drop" })).toBeDisabled();
        expect(screen.getByRole("switch", { name: "Back in stock" })).toBeDisabled();
        expect(screen.getByText("Updating alerts...")).toHaveAttribute("aria-live", "polite");
        expect(screen.getByRole("alert")).toHaveTextContent("Unable to save alerts.");
        expect(screen.getByTestId("product-alert-controls")).toHaveAttribute("aria-busy", "true");
    });
});
