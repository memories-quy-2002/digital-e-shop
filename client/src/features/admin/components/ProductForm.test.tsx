// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ProductForm, { type ProductFormValues } from "./ProductForm";

const values: ProductFormValues = {
    name: "RTX 4070 SUPER",
    sku: "GPU-EX-001",
    manufacturerPartNumber: "90YV0KC0",
    warrantyMonths: "24",
    description: "A graphics card for high refresh-rate gaming.",
    category: "Graphics cards",
    brand: "ASUS",
    price: "599.99",
    salePrice: "",
    model: "ROG Strix",
    warranty: "Local warranty coverage",
    datasheet: "https://example.com/datasheet.pdf",
    highlights: "Quiet operation",
    specifications: "Memory: 16GB",
    attributes: [],
};

const callbacks = () => ({
    onChange: vi.fn(),
    onAttributeChange: vi.fn(),
    onAddAttribute: vi.fn(),
    onRemoveAttribute: vi.fn(),
});

describe("ProductForm", () => {
    it("keeps edit inventory read-only and exposes semantic sections", () => {
        render(<ProductForm mode="edit" values={values} currentStock={7} {...callbacks()} />);

        expect(screen.getByRole("group", { name: "Product identity" })).toBeInTheDocument();
        expect(screen.getByRole("group", { name: "Pricing" })).toBeInTheDocument();
        expect(screen.getByRole("group", { name: "Inventory" })).toBeInTheDocument();
        expect(screen.getByRole("group", { name: "Storefront content" })).toBeInTheDocument();
        expect(screen.queryByLabelText(/Inventory Quantity/)).not.toBeInTheDocument();
        expect(screen.getByLabelText("Current stock")).toHaveTextContent("7");
        expect(screen.getByLabelText(/Product Name/)).toHaveAttribute("id", "product-form-name");
        expect(screen.getByLabelText("Description")).toHaveAttribute("id", "product-form-description");
    });

    it("routes controlled field changes through the shared callback", () => {
        const formCallbacks = callbacks();
        render(<ProductForm mode="create" values={{ ...values, inventory: "0" }} {...formCallbacks} />);

        fireEvent.change(screen.getByLabelText(/Product Name/), { target: { value: "Updated product" } });
        fireEvent.change(screen.getByLabelText(/Inventory Quantity/), { target: { value: "12" } });

        expect(formCallbacks.onChange).toHaveBeenNthCalledWith(1, "name", "Updated product");
        expect(formCallbacks.onChange).toHaveBeenNthCalledWith(2, "inventory", "12");
    });
});
