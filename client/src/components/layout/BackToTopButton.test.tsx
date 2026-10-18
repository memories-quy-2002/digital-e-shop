import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import BackToTopButton from "./BackToTopButton";

vi.mock("../../hooks/useT", () => ({
    useT: () => (key: string) => key,
}));

const originalScrollY = Object.getOwnPropertyDescriptor(window, "scrollY");
const originalMatchMedia = Object.getOwnPropertyDescriptor(window, "matchMedia");

const setScrollY = (scrollY: number) => {
    Object.defineProperty(window, "scrollY", { configurable: true, value: scrollY });
};

const setReducedMotion = (matches: boolean) => {
    Object.defineProperty(window, "matchMedia", {
        configurable: true,
        value: vi.fn().mockReturnValue({ matches }),
    });
};

describe("BackToTopButton", () => {
    afterEach(() => {
        vi.restoreAllMocks();

        if (originalScrollY) {
            Object.defineProperty(window, "scrollY", originalScrollY);
        } else {
            Reflect.deleteProperty(window, "scrollY");
        }

        if (originalMatchMedia) {
            Object.defineProperty(window, "matchMedia", originalMatchMedia);
        } else {
            Reflect.deleteProperty(window, "matchMedia");
        }
    });

    it("appears after scrolling down and is rendered outside the footer", () => {
        render(<BackToTopButton />);

        expect(screen.queryByRole("button", { name: "footer.backToTop" })).not.toBeInTheDocument();

        setScrollY(400);
        fireEvent.scroll(window);

        const button = screen.getByRole("button", { name: "footer.backToTop" });
        expect(button).toBeInTheDocument();
        expect(button.closest("footer")).toBeNull();

        setScrollY(0);
        fireEvent.scroll(window);
        expect(screen.queryByRole("button", { name: "footer.backToTop" })).not.toBeInTheDocument();
    });

    it("smoothly scrolls to the top when activated", () => {
        const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
        setScrollY(400);
        setReducedMotion(false);

        render(<BackToTopButton />);
        fireEvent.click(screen.getByRole("button", { name: "footer.backToTop" }));

        expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });
    });

    it("uses an immediate scroll when reduced motion is preferred", () => {
        const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
        setScrollY(400);
        setReducedMotion(true);

        render(<BackToTopButton />);
        fireEvent.click(screen.getByRole("button", { name: "footer.backToTop" }));

        expect(scrollTo).toHaveBeenCalledWith(0, 0);
    });
});
