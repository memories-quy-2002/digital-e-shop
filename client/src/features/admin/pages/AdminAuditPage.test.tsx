import React, { useEffect } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminAuditPage from "./AdminAuditPage";
import { fetchAdminAuditPage } from "../api";
import { LocaleProvider, useLocale } from "../../../context/LocaleContext";

vi.mock("../api", () => ({ fetchAdminAuditPage: vi.fn() }));
vi.mock("../../../components/layout/AdminLayout", () => ({ default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));

const LoadAdminTranslations = () => {
    const { loadAdminTranslations } = useLocale();
    useEffect(() => { void loadAdminTranslations(); }, [loadAdminTranslations]);
    return null;
};

const renderAdminPage = () => render(
    <LocaleProvider>
        <LoadAdminTranslations />
        <AdminAuditPage />
    </LocaleProvider>,
);

describe("AdminAuditPage", () => {
    beforeEach(() => vi.clearAllMocks());

    it("loads paginated audit events and shows their reason and changes", async () => {
        vi.mocked(fetchAdminAuditPage).mockResolvedValue({
            items: [{
                id: 9,
                actor_id: "admin-1",
                action: "inventory.stock.adjusted",
                entity_type: "product",
                entity_id: "12",
                reason: "Restock from supplier",
                changes: { before: 2, after: 10 },
                created_at: "2026-10-15T10:00:00.000Z",
            }],
            pagination: { page: 1, limit: 25, total: 1, totalPages: 1 },
        });

        renderAdminPage();

        expect(await screen.findByText("Inventory stock adjusted")).toBeInTheDocument();
        expect(screen.getByText("Restock from supplier")).toBeInTheDocument();
        expect(screen.getByText("2 → 10")).toBeInTheDocument();
        expect(fetchAdminAuditPage).toHaveBeenCalledWith({ page: 1, limit: 25, search: "", entityType: undefined });
    });

    it("shows a retryable error rather than a false empty state", async () => {
        vi.mocked(fetchAdminAuditPage).mockRejectedValue({ response: { status: 500 } });
        renderAdminPage();

        await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Unable to load admin data"));
        expect(screen.queryByText("No audit events found")).not.toBeInTheDocument();
    });
});
