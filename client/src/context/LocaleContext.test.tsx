import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { LocaleProvider, useLocale } from "./LocaleContext";

const LocaleProbe = () => {
    const { locale, setLocale, loadAdminTranslations, t } = useLocale();
    const adminTitle = (t as unknown as { adminAudit?: { title?: string } }).adminAudit?.title ?? "not loaded";

    return (
        <div>
            <span data-testid="locale">{locale}</span>
            <span data-testid="audit-title">{adminTitle}</span>
            <button type="button" onClick={() => setLocale("vi")}>Vietnamese</button>
            <button type="button" onClick={() => setLocale("en")}>English</button>
            <button type="button" onClick={() => void loadAdminTranslations()}>Load Admin translations</button>
        </div>
    );
};

describe("LocaleProvider", () => {
    beforeEach(() => {
        window.localStorage.clear();
        document.documentElement.lang = "";
    });

    it("keeps Admin keys out of the storefront dictionary and loads the saved locale on demand", async () => {
        window.localStorage.setItem("digital-e:locale:v1", JSON.stringify("vi"));

        render(<LocaleProvider><LocaleProbe /></LocaleProvider>);

        expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
        expect(await screen.findByTestId("locale")).toHaveTextContent("vi");
        expect(screen.getByTestId("audit-title")).toHaveTextContent("not loaded");
        fireEvent.click(screen.getByRole("button", { name: "Load Admin translations" }));
        await waitFor(() => expect(screen.getByTestId("audit-title")).toHaveTextContent("Nhật ký kiểm toán"));
        expect(screen.getByTestId("locale")).toHaveTextContent("vi");
        expect(document.documentElement.lang).toBe("vi");
    });

    it("loads the Admin dictionary for the current locale after a locale switch", async () => {
        render(<LocaleProvider><LocaleProbe /></LocaleProvider>);

        fireEvent.click(screen.getByRole("button", { name: "Vietnamese" }));
        await waitFor(() => expect(screen.getByTestId("locale")).toHaveTextContent("vi"));
        expect(screen.getByTestId("audit-title")).toHaveTextContent("not loaded");
        expect(window.localStorage.getItem("digital-e:locale:v1")).toBe(JSON.stringify("vi"));

        fireEvent.click(screen.getByRole("button", { name: "Load Admin translations" }));
        await waitFor(() => expect(screen.getByTestId("audit-title")).toHaveTextContent("Nhật ký kiểm toán"));

        fireEvent.click(screen.getByRole("button", { name: "English" }));
        await waitFor(() => expect(screen.getByTestId("locale")).toHaveTextContent("en"));
        expect(screen.getByTestId("audit-title")).toHaveTextContent("not loaded");
        expect(window.localStorage.getItem("digital-e:locale:v1")).toBe(JSON.stringify("en"));
    });
});
