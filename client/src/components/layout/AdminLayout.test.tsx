import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { LocaleProvider } from "../../context/LocaleContext";
import AdminLayout from "./AdminLayout";

vi.mock("./AdminHeader", () => ({
    default: ({ onOpenSidebar }: { onOpenSidebar: () => void }) => (
        <header>
            <button type="button" onClick={onOpenSidebar}>Open navigation</button>
        </header>
    ),
}));
vi.mock("./AdminSidebar", () => ({ default: () => <nav /> }));

describe("AdminLayout", () => {
    beforeEach(() => {
        vi.stubGlobal("matchMedia", vi.fn().mockImplementation((query: string) => ({
            matches: query === "(max-width: 1024px)",
            media: query,
            onchange: null,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            addListener: vi.fn(),
            removeListener: vi.fn(),
            dispatchEvent: vi.fn(),
        })));
    });

    afterEach(() => vi.unstubAllGlobals());

    it("provides a keyboard skip link to the admin page content", () => {
        render(
            <MemoryRouter>
                <LocaleProvider>
                    <AdminLayout>
                        <main>Admin page</main>
                    </AdminLayout>
                </LocaleProvider>
            </MemoryRouter>,
        );

        expect(screen.getByRole("link", { name: "Skip to main content" })).toHaveAttribute("href", "#admin-main-content");
        expect(document.getElementById("admin-main-content")).toHaveAttribute("tabindex", "-1");
    });

    it("labels the navigation scrim with the active locale", async () => {
        render(
            <MemoryRouter>
                <LocaleProvider>
                    <AdminLayout>
                        <main>Admin page</main>
                    </AdminLayout>
                </LocaleProvider>
            </MemoryRouter>,
        );

        fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));

        expect(screen.getByRole("button", { name: "Close menu" })).toBeInTheDocument();
    });
});
