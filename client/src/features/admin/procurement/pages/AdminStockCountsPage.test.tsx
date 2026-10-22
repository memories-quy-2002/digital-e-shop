import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import AdminStockCountsPage from "./AdminStockCountsPage";
import { fetchStockCounts } from "../api";
import { fetchAdminProductsPage } from "../../api";

vi.mock("react-helmet-async", () => ({ Helmet: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("../../../../components/layout/AdminLayout", () => ({ default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("../../../../context/LocaleContext", () => ({ useLocale: () => ({ locale: "en" }) }));
vi.mock("../../../../context/ToastContext", () => ({ useToast: () => ({ addToast: vi.fn() }) }));
vi.mock("../../../../hooks/useAdminCopy", () => ({ useAdminCopy: () => (value: string) => value }));
vi.mock("../../components/AdminStatusPanel", () => ({ default: ({ title, description }: { title: string; description: string }) => <div role="status"><strong>{title}</strong><span>{description}</span></div> }));
vi.mock("../../components/AdminTableScrollHint", () => ({ default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("../../api", () => ({ fetchAdminProductsPage: vi.fn() }));
vi.mock("../api", () => ({ fetchStockCounts: vi.fn(), fetchStockCount: vi.fn(), createStockCount: vi.fn(), updateStockCount: vi.fn(), transitionStockCount: vi.fn() }));

describe("AdminStockCountsPage", () => {
    afterEach(() => cleanup());

    it("explains the count basis and provides an explicit empty state", async () => {
        vi.mocked(fetchStockCounts).mockResolvedValue({ items: [], pagination: { page: 1, limit: 25, total: 0, totalPages: 0 } });
        vi.mocked(fetchAdminProductsPage).mockResolvedValue({ items: [], pagination: { page: 1, limit: 100, total: 0, totalPages: 0 }, summary: { total: 0, lowStock: 0, outOfStock: 0 } });

        render(<AdminStockCountsPage />);

        expect(screen.getByRole("heading", { name: "Stock counts" })).toBeTruthy();
        expect(screen.getByText("Count unallocated warehouse units")).toBeTruthy();
        await waitFor(() => expect(screen.getByText("No count sessions")).toBeTruthy());
        expect(screen.getByText("No matching products.")).toBeTruthy();
    });
});
