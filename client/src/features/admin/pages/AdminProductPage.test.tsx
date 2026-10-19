import { renderWithLocale } from '../../../test-utils/renderWithLocale';
import { screen, waitFor } from "@testing-library/react";
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
    });

    it("shows an inventory error instead of an empty movement log when the movement request fails", async () => {
        vi.mocked(fetchInventoryMovements).mockRejectedValue({ request: {} });
        renderWithLocale(<AdminProductPage />);

        await waitFor(() => expect(screen.getByText("Inventory movements unavailable")).toBeInTheDocument());
        expect(screen.queryByText("No inventory movements recorded yet.")).not.toBeInTheDocument();
    });
});
