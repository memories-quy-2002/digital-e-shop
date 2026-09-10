import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import AdminSidebar from "./AdminSidebar";

const renderSidebar = (isCollapsed = false) => {
    const onToggleCollapsed = vi.fn();
    const view = render(
        <MemoryRouter initialEntries={["/admin/orders"]}>
            <AdminSidebar isCollapsed={isCollapsed} onToggleCollapsed={onToggleCollapsed} />
        </MemoryRouter>,
    );

    return { ...view, onToggleCollapsed };
};

describe("AdminSidebar", () => {
    it("keeps identity in the header and focuses the sidebar on navigation", () => {
        renderSidebar();

        const sidebar = screen.getByRole("complementary", { name: "Admin navigation panel" });

        expect(within(sidebar).queryByText("Minh Nguyen")).not.toBeInTheDocument();
        expect(within(sidebar).queryByText("Anonymous")).not.toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Orders" })).toHaveClass("active");

        const collapseButton = screen.getByRole("button", { name: "Collapse admin navigation" });
        expect(collapseButton).toHaveAttribute("aria-expanded", "true");
        expect(collapseButton).toHaveAttribute("aria-controls", "admin-navigation");
    });

    it("communicates and triggers the collapsed navigation state", () => {
        const { onToggleCollapsed } = renderSidebar(true);

        const expandButton = screen.getByRole("button", { name: "Expand admin navigation" });
        expect(expandButton).toHaveAttribute("aria-expanded", "false");

        fireEvent.click(expandButton);

        expect(onToggleCollapsed).toHaveBeenCalledOnce();
    });
});
