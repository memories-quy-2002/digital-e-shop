import { renderWithLocale } from '../../../test-utils/renderWithLocale';
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminProductPage from "./AdminProductPage";
import { fetchAdminProductsPage, fetchInventoryMovements } from "../api";

vi.mock("../api", () => ({
    fetchAdminProductsPage: vi.fn(),
    fetchInventoryMovements: vi.fn(),
    updateProduct: vi.fn(),
    deleteProduct: vi.fn(),
    updateProductInventory: vi.fn(),
}));
vi.mock("../../../components/layout/AdminLayout", () => ({ default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("../../../context/ToastContext", () => ({ useToast: () => ({ addToast: vi.fn() }) }));
vi.mock("react-router-dom", async () => ({
    ...(await vi.importActual<typeof import("react-router-dom")>("react-router-dom")),
    useNavigate: () => vi.fn(),
}));

describe("AdminProductPage inventory movement request state", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(fetchAdminProductsPage).mockResolvedValue({
            items: [],
            pagination: { page: 1, limit: 8, total: 0, totalPages: 0 },
            summary: { total: 0, lowStock: 0, outOfStock: 0 },
        });
        vi.mocked(fetchInventoryMovements).mockResolvedValue([]);
    });

    it("shows an inventory error instead of an empty movement log when the movement request fails", async () => {
        vi.mocked(fetchInventoryMovements).mockRejectedValue({ request: {} });
        renderWithLocale(<AdminProductPage />);

        await waitFor(() => expect(screen.getByText("Inventory movements unavailable")).toBeInTheDocument());
        expect(screen.queryByText("No inventory movements recorded yet.")).not.toBeInTheDocument();
    });

    it("keeps focus in Sale price while typing in the Manage product dialog", async () => {
        const product = {
            id: 120,
            name: "Canon EOS 120",
            sku: "DEMO-0120",
            manufacturerPartNumber: null,
            warrantyMonths: null,
            category: "Camera",
            brand: "Canon",
            price: 10250000,
            sale_price: null,
            rating: 0,
            reviews: 0,
            main_image: null,
            stock: 10,
            description: "",
            specifications: null,
            attributes: [],
        };
        vi.mocked(fetchAdminProductsPage).mockResolvedValue({
            items: [product],
            pagination: { page: 1, limit: 8, total: 1, totalPages: 1 },
            summary: { total: 1, lowStock: 0, outOfStock: 0 },
        });
        renderWithLocale(<AdminProductPage />);

        fireEvent.click(await screen.findByRole("button", { name: "Manage Canon EOS 120" }));
        const salePrice = screen.getByLabelText("Sale price ($)");
        salePrice.focus();
        fireEvent.change(salePrice, { target: { value: "8" } });

        expect(salePrice).toHaveValue(8);
        expect(document.activeElement).toBe(salePrice);
    });
});
