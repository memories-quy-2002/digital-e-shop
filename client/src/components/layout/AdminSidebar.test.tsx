import { fireEvent, render, screen, within } from "@testing-library/react";
import { isValidElement, type ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "../../context/LocaleContext";
import AdminSidebar from "./AdminSidebar";
import { adminNavGroups } from "./adminNavigation";

const renderSidebar = (isCollapsed = false) => {
    const onToggleCollapsed = vi.fn();
    const view = render(
        <LocaleProvider>
            <MemoryRouter initialEntries={["/admin/orders"]}>
                <AdminSidebar isCollapsed={isCollapsed} onToggleCollapsed={onToggleCollapsed} />
            </MemoryRouter>
        </LocaleProvider>,
    );

    return { ...view, onToggleCollapsed };
};

describe("AdminSidebar", () => {
    it("uses a distinct icon for every destination in the collapsed sidebar", () => {
        const icons = adminNavGroups.flatMap((group) => group.items.map((item) => item.icon));

        expect(icons.every(isValidElement)).toBe(true);
        expect(new Set(icons.map((icon) => (icon as ReactElement).type)).size).toBe(icons.length);
    });

    it("keeps identity in the header and focuses the sidebar on navigation", () => {
        renderSidebar();

        const sidebar = screen.getByRole("complementary", { name: "Admin navigation panel" });

        expect(within(sidebar).queryByText("Minh Nguyen")).not.toBeInTheDocument();
        expect(within(sidebar).queryByText("Anonymous")).not.toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Orders" })).toHaveClass("active");
        expect(screen.getByRole("link", { name: "Notifications" })).toBeInTheDocument();
        expect(screen.queryByRole("link", { name: "Audit log" })).not.toBeInTheDocument();
        expect(screen.getByRole("navigation", { name: "Admin navigation" })).toHaveTextContent("Overview");
        expect(screen.getByRole("navigation", { name: "Admin navigation" })).toHaveTextContent("Commerce");
        expect(screen.getByRole("navigation", { name: "Admin navigation" })).toHaveTextContent("People & support");
        expect(screen.getByRole("navigation", { name: "Admin navigation" })).toHaveTextContent("Finance");
        expect(screen.getByRole("navigation", { name: "Admin navigation" })).toHaveTextContent("System & setup");
        const navigation = screen.getByRole("navigation", { name: "Admin navigation" });
        expect(within(navigation).getAllByRole("link")).toHaveLength(6);
        expect(within(navigation).getByRole("button", { name: "Overview" })).toHaveAttribute("aria-expanded", "true");
        expect(within(navigation).getByRole("button", { name: "Commerce" })).toHaveAttribute("aria-expanded", "true");
        const financeGroup = within(navigation).getByRole("button", { name: "Finance" });
        expect(financeGroup).toHaveAttribute("aria-expanded", "false");
        fireEvent.click(financeGroup);
        expect(screen.getByRole("link", { name: "Payment reconciliation" })).toBeInTheDocument();
        expect(within(navigation).getAllByRole("link")).toHaveLength(8);
        const peopleGroup = within(navigation).getByRole("button", { name: "People & support" });
        expect(peopleGroup).toHaveAttribute("aria-expanded", "false");
        expect(screen.queryByRole("link", { name: "After-sales" })).not.toBeInTheDocument();
        fireEvent.click(peopleGroup);
        expect(peopleGroup).toHaveAttribute("aria-expanded", "true");
        expect(screen.getByRole("link", { name: "After-sales" })).toHaveAttribute("href", "/admin/after-sales");
        expect(within(navigation).getAllByRole("link")).toHaveLength(11);
        const systemGroup = within(navigation).getByRole("button", { name: "System & setup" });
        expect(systemGroup).toHaveAttribute("aria-expanded", "false");
        fireEvent.click(systemGroup);
        expect(systemGroup).toHaveAttribute("aria-expanded", "true");
        expect(screen.getByRole("link", { name: "Delivery settings" })).toHaveAttribute("href", "/admin/delivery/settings");
        expect(screen.getByRole("link", { name: "Audit log" })).toBeInTheDocument();
        expect(within(navigation).getAllByRole("link")).toHaveLength(14);
        expect(screen.getByRole("link", { name: "Open storefront" })).toHaveAttribute("href", "/");

        const collapseButton = screen.getByRole("button", { name: "Collapse admin navigation" });
        expect(collapseButton).toHaveAttribute("aria-expanded", "true");
        expect(collapseButton).toHaveAttribute("aria-controls", "admin-navigation");
    });

    it("keeps the payment reconciliation link active for its nested route", () => {
        render(
            <LocaleProvider>
                <MemoryRouter initialEntries={["/admin/payments/reconciliation"]}>
                    <AdminSidebar />
                </MemoryRouter>
            </LocaleProvider>,
        );

        expect(screen.getByRole("link", { name: "Payment reconciliation" })).toHaveClass("active");
    });

    it("starts with Overview and Commerce expanded on the admin landing page", () => {
        render(
            <LocaleProvider>
                <MemoryRouter initialEntries={["/admin"]}>
                    <AdminSidebar />
                </MemoryRouter>
            </LocaleProvider>,
        );

        expect(screen.getByRole("button", { name: "Overview" })).toHaveAttribute("aria-expanded", "true");
        expect(screen.getByRole("button", { name: "Commerce" })).toHaveAttribute("aria-expanded", "true");
        expect(screen.getByRole("link", { name: "Dashboard" })).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Orders" })).toBeInTheDocument();
    });

    it("opens System & setup for an active page and collapses it after leaving that group", () => {
        render(
            <LocaleProvider>
                <MemoryRouter initialEntries={["/admin/audit"]}>
                    <AdminSidebar />
                </MemoryRouter>
            </LocaleProvider>,
        );

        expect(screen.getByRole("button", { name: "System & setup" })).toHaveAttribute("aria-expanded", "true");
        expect(screen.getByRole("link", { name: "Audit log" })).toHaveClass("active");

        fireEvent.click(screen.getByRole("link", { name: "Orders" }));

        expect(screen.getByRole("button", { name: "System & setup" })).toHaveAttribute("aria-expanded", "false");
        expect(screen.queryByRole("link", { name: "Audit log" })).not.toBeInTheDocument();
    });

    it("opens People & support for an active page and collapses it after leaving that group", () => {
        render(
            <LocaleProvider>
                <MemoryRouter initialEntries={["/admin/support"]}>
                    <AdminSidebar />
                </MemoryRouter>
            </LocaleProvider>,
        );

        expect(screen.getByRole("button", { name: "People & support" })).toHaveAttribute("aria-expanded", "true");
        expect(screen.getByRole("link", { name: "Support" })).toHaveClass("active");

        fireEvent.click(screen.getByRole("link", { name: "Orders" }));

        expect(screen.getByRole("button", { name: "People & support" })).toHaveAttribute("aria-expanded", "false");
        expect(screen.queryByRole("link", { name: "Support" })).not.toBeInTheDocument();
    });

    it("communicates and triggers the collapsed navigation state", () => {
        const { onToggleCollapsed } = renderSidebar(true);

        const expandButton = screen.getByRole("button", { name: "Expand admin navigation" });
        expect(expandButton).toHaveAttribute("aria-expanded", "false");

        fireEvent.click(expandButton);

        expect(onToggleCollapsed).toHaveBeenCalledOnce();
    });
});
