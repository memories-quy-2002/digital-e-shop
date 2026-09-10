// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminAddProductPage from "./AdminAddProductPage";
import { addProduct } from "../api";

const mocks = vi.hoisted(() => ({
    addToast: vi.fn(),
    navigate: vi.fn(),
}));

vi.mock("../api", () => ({
    addProduct: vi.fn(),
    uploadBlob: vi.fn(),
}));
vi.mock("../../products/api", () => ({
    createProductAttributeRow: () => ({ id: "attribute-1", key: "", label: "", type: "text", value: "", unit: "", filterable: false }),
    productAttributeRowsToInputs: vi.fn(() => []),
}));
vi.mock("../../../components/layout/AdminLayout", () => ({
    default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("../../../context/ToastContext", () => ({ useToast: () => ({ addToast: mocks.addToast }) }));
vi.mock("react-router-dom", async () => ({
    ...(await vi.importActual<typeof import("react-router-dom")>("react-router-dom")),
    useNavigate: () => mocks.navigate,
}));

const fillRequiredFields = () => {
    fireEvent.change(screen.getByLabelText(/Product Name/), { target: { value: "USB-C Hub" } });
    fireEvent.change(screen.getByLabelText(/Category/), { target: { value: "Accessories" } });
    fireEvent.change(screen.getByLabelText(/Brand/), { target: { value: "Example" } });
};

describe("AdminAddProductPage validation", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(addProduct).mockResolvedValue(undefined as never);
    });

    it("marks only the server-required controls as required", () => {
        render(<AdminAddProductPage />);

        expect(screen.getByLabelText(/Product Name/)).toBeRequired();
        expect(screen.getByLabelText(/Category/)).toBeRequired();
        expect(screen.getByLabelText(/Brand/)).toBeRequired();
        expect(screen.getByLabelText(/Price/)).toBeRequired();
        expect(screen.getByLabelText(/Inventory Quantity/)).toBeRequired();
        expect(screen.getByLabelText("Description")).not.toBeRequired();
        expect(screen.getByLabelText("Product Image")).not.toBeRequired();
    });

    it("blocks an empty submission before constructing a product request", () => {
        render(<AdminAddProductPage />);

        fireEvent.submit(screen.getByRole("button", { name: "Save Product" }).closest("form")!);

        expect(addProduct).not.toHaveBeenCalled();
        expect(screen.getByRole("alert")).toHaveTextContent("Product name is required.");
        expect(screen.getByLabelText(/Product Name/)).toHaveFocus();
    });

    it("accepts zero price and inventory without optional copy or image", async () => {
        render(<AdminAddProductPage />);
        fillRequiredFields();

        fireEvent.submit(screen.getByRole("button", { name: "Save Product" }).closest("form")!);

        await waitFor(() => expect(addProduct).toHaveBeenCalledOnce());
        expect(mocks.navigate).toHaveBeenCalledWith("/admin/products");
    });

    it("keeps the server mutation error path", async () => {
        vi.mocked(addProduct).mockRejectedValue(new Error("Duplicate SKU"));
        render(<AdminAddProductPage />);
        fillRequiredFields();

        fireEvent.submit(screen.getByRole("button", { name: "Save Product" }).closest("form")!);

        expect(await screen.findByRole("alert")).toHaveTextContent("Duplicate SKU");
    });

    it("groups product fields semantically and associates every label with its control", () => {
        render(<AdminAddProductPage />);

        const identity = screen.getByRole("group", { name: "Product identity" });
        const pricing = screen.getByRole("group", { name: "Pricing and inventory" });
        const content = screen.getByRole("group", { name: "Storefront content" });
        const identityName = within(identity).getByLabelText(/Product Name/);
        const category = within(identity).getByLabelText(/Category/);
        const price = within(pricing).getByLabelText(/Price/);
        const description = within(content).getByLabelText("Description");

        expect(identity.querySelector("legend")?.textContent).toBe("Product identity");
        expect(pricing.querySelector("legend")?.textContent).toBe("Pricing and inventory");
        expect(content.querySelector("legend")?.textContent).toBe("Storefront content");
        expect(identityName).toHaveAttribute("id");
        expect(category).toHaveAttribute("id");
        expect(price).toHaveAttribute("id");
        expect(description).toHaveAttribute("id");
        expect(identityName.id).not.toBe("");
        expect(category.id).not.toBe("");
        expect(price.id).not.toBe("");
        expect(description.id).not.toBe("");
    });
});
