import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminProductPage from "./AdminProductPage";
import { fetchAllProducts, fetchInventoryMovements } from "../api";

vi.mock("../api", () => ({
    fetchAllProducts: vi.fn(),
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
    beforeEach(() => vi.clearAllMocks());

    it("shows an inventory error instead of an empty movement log when the movement request fails", async () => {
        vi.mocked(fetchAllProducts).mockResolvedValue([]);
        vi.mocked(fetchInventoryMovements).mockRejectedValue({ request: {} });
        render(<AdminProductPage />);

        await waitFor(() => expect(screen.getByText("Inventory movements unavailable")).toBeInTheDocument());
        expect(screen.queryByText("No inventory movements recorded yet.")).not.toBeInTheDocument();
    });
});
