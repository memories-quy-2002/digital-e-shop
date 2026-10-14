import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "../../context/LocaleContext";
import AdminLayout from "./AdminLayout";

vi.mock("./AdminHeader", () => ({ default: () => <header /> }));
vi.mock("./AdminSidebar", () => ({ default: () => <nav /> }));

describe("AdminLayout", () => {
    it("provides a keyboard skip link to the admin page content", () => {
        render(
            <LocaleProvider>
                <AdminLayout>
                    <main>Admin page</main>
                </AdminLayout>
            </LocaleProvider>,
        );

        expect(screen.getByRole("link", { name: "Skip to main content" })).toHaveAttribute("href", "#admin-main-content");
        expect(document.getElementById("admin-main-content")).toHaveAttribute("tabindex", "-1");
    });
});
