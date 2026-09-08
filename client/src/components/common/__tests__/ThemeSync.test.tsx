import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import ThemeSync from "../ThemeSync";

const STORAGE_KEY = "digital-e:color-scheme:v1";

describe("ThemeSync", () => {
    beforeEach(() => {
        window.localStorage.clear();
        document.documentElement.removeAttribute("data-theme");
        document.documentElement.style.removeProperty("color-scheme");
    });

    it("applies a persisted light scheme without requiring the storefront header", async () => {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify("light"));

        render(<ThemeSync />);

        await waitFor(() => {
            expect(document.documentElement.dataset.theme).toBe("light");
        });
        expect(document.documentElement.style.colorScheme).toBe("light");
    });
});
