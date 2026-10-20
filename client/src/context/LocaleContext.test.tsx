import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { LocaleProvider, useLocale } from "./LocaleContext";

const LocaleProbe = () => {
    const { locale, setLocale, t } = useLocale();

    return (
        <div>
            <span data-testid="locale">{locale}</span>
            <span data-testid="audit-title">{t.adminAudit.title}</span>
            <button type="button" onClick={() => setLocale("vi")}>Vietnamese</button>
            <button type="button" onClick={() => setLocale("en")}>English</button>
        </div>
    );
};

describe("LocaleProvider", () => {
    beforeEach(() => {
        window.localStorage.clear();
        document.documentElement.lang = "";
    });

    it("loads the saved Vietnamese dictionary before rendering app content", async () => {
        window.localStorage.setItem("digital-e:locale:v1", JSON.stringify("vi"));

        render(<LocaleProvider><LocaleProbe /></LocaleProvider>);

        expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
        expect(await screen.findByTestId("audit-title")).toHaveTextContent("Nhật ký kiểm toán");
        expect(screen.getByTestId("locale")).toHaveTextContent("vi");
        expect(document.documentElement.lang).toBe("vi");
    });

    it("loads a selected locale before switching and persists the choice", async () => {
        render(<LocaleProvider><LocaleProbe /></LocaleProvider>);

        fireEvent.click(screen.getByRole("button", { name: "Vietnamese" }));
        await waitFor(() => expect(screen.getByTestId("audit-title")).toHaveTextContent("Nhật ký kiểm toán"));
        expect(window.localStorage.getItem("digital-e:locale:v1")).toBe(JSON.stringify("vi"));

        fireEvent.click(screen.getByRole("button", { name: "English" }));
        await waitFor(() => expect(screen.getByTestId("audit-title")).toHaveTextContent("Audit log"));
        expect(window.localStorage.getItem("digital-e:locale:v1")).toBe(JSON.stringify("en"));
    });
});
