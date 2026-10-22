import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { LocaleProvider, useLocale } from "../../context/LocaleContext";
import { useT } from "../../hooks/useT";
import * as i18n from "../../i18n";
import AdminLayout from "./AdminLayout";

const AdminTranslationProbe = () => {
    const t = useT();
    const { setLocale } = useLocale();
    return (
        <>
            <main data-testid="admin-translation">{t("adminAudit.title")}</main>
            <button type="button" onClick={() => setLocale("vi")}>Switch to Vietnamese</button>
        </>
    );
};

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
        window.localStorage.clear();
        document.documentElement.lang = "";
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

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it("waits for the selected locale's Admin translations before rendering the shell or page", async () => {
        render(
            <MemoryRouter>
                <LocaleProvider>
                    <AdminLayout>
                        <AdminTranslationProbe />
                    </AdminLayout>
                </LocaleProvider>
            </MemoryRouter>,
        );

        expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
        expect(screen.queryByTestId("admin-translation")).not.toBeInTheDocument();
        expect(await screen.findByTestId("admin-translation")).toHaveTextContent("Audit log");
        expect(screen.getByRole("link", { name: "Skip to main content" })).toHaveAttribute("href", "#admin-main-content");
    });

    it("loads Vietnamese Admin translations for a direct Admin entry", async () => {
        window.localStorage.setItem("digital-e:locale:v1", JSON.stringify("vi"));

        render(
            <MemoryRouter initialEntries={["/admin/audit"]}>
                <LocaleProvider>
                    <AdminLayout>
                        <AdminTranslationProbe />
                    </AdminLayout>
                </LocaleProvider>
            </MemoryRouter>,
        );

        expect(await screen.findByTestId("admin-translation")).toHaveTextContent("Nhật ký kiểm toán");
    });

    it("waits for the new Admin dictionary when changing locale in place", async () => {
        const originalLoader = i18n.loadAdminDictionary;
        const vietnameseDictionary = await originalLoader("vi");
        let resolveVietnamese!: (dictionary: Awaited<ReturnType<typeof i18n.loadAdminDictionary>>) => void;
        const pendingVietnamese = new Promise<Awaited<ReturnType<typeof i18n.loadAdminDictionary>>>((resolve) => {
            resolveVietnamese = resolve;
        });
        vi.spyOn(i18n, "loadAdminDictionary").mockImplementation((locale) =>
            locale === "vi" ? pendingVietnamese : originalLoader(locale),
        );

        render(
            <MemoryRouter>
                <LocaleProvider>
                    <AdminLayout>
                        <AdminTranslationProbe />
                    </AdminLayout>
                </LocaleProvider>
            </MemoryRouter>,
        );

        expect(await screen.findByTestId("admin-translation")).toHaveTextContent("Audit log");
        fireEvent.click(screen.getByRole("button", { name: "Switch to Vietnamese" }));

        await waitFor(() => expect(document.documentElement.lang).toBe("vi"));
        expect(screen.queryByTestId("admin-translation")).not.toBeInTheDocument();
        await act(async () => resolveVietnamese(vietnameseDictionary));
        expect(await screen.findByTestId("admin-translation")).toHaveTextContent("Nhật ký kiểm toán");
    });

    it("shows a retry action when Admin translations fail to load", async () => {
        const adminDictionary = {
            adminAudit: { title: "Audit log" },
            shipping: { adminTitle: "Fulfillment" },
        } as unknown as Awaited<ReturnType<typeof i18n.loadAdminDictionary>>;
        const loadAdminDictionary = vi.spyOn(i18n, "loadAdminDictionary")
            .mockRejectedValueOnce(new Error("Chunk unavailable"))
            .mockResolvedValueOnce(adminDictionary);

        render(
            <MemoryRouter>
                <LocaleProvider>
                    <AdminLayout>
                        <AdminTranslationProbe />
                    </AdminLayout>
                </LocaleProvider>
            </MemoryRouter>,
        );

        expect(await screen.findByRole("alert")).toHaveTextContent("Unable to load administrator translations.");
        fireEvent.click(screen.getByRole("button", { name: "Retry" }));

        expect(await screen.findByTestId("admin-translation")).toHaveTextContent("Audit log");
        expect(loadAdminDictionary).toHaveBeenCalledTimes(2);
    });

    it("provides a keyboard skip link to the admin page content", async () => {
        render(
            <MemoryRouter>
                <LocaleProvider>
                    <AdminLayout>
                        <main>Admin page</main>
                    </AdminLayout>
                </LocaleProvider>
            </MemoryRouter>,
        );

        expect(await screen.findByRole("link", { name: "Skip to main content" })).toHaveAttribute("href", "#admin-main-content");
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

        fireEvent.click(await screen.findByRole("button", { name: "Open navigation" }));

        expect(screen.getByRole("button", { name: "Close menu" })).toBeInTheDocument();
    });
});
