import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import BackToTopButton from "./BackToTopButton";

vi.mock("../../hooks/useT", () => ({
    useT: () => (key: string) => key,
}));

const originalScrollY = Object.getOwnPropertyDescriptor(window, "scrollY");
const originalMatchMedia = Object.getOwnPropertyDescriptor(window, "matchMedia");
const originalRequestAnimationFrame = Object.getOwnPropertyDescriptor(window, "requestAnimationFrame");
const originalCancelAnimationFrame = Object.getOwnPropertyDescriptor(window, "cancelAnimationFrame");
const originalIntersectionObserver = Object.getOwnPropertyDescriptor(globalThis, "IntersectionObserver");

const setScrollY = (scrollY: number) => {
    Object.defineProperty(window, "scrollY", { configurable: true, value: scrollY });
};

const setReducedMotion = (matches: boolean) => {
    Object.defineProperty(window, "matchMedia", {
        configurable: true,
        value: vi.fn().mockReturnValue({ matches }),
    });
};

const disableIntersectionObserver = () => {
    Object.defineProperty(globalThis, "IntersectionObserver", {
        configurable: true,
        value: undefined,
    });
};

const mockAnimationFrames = () => {
    let nextFrameId = 1;
    const callbacks = new Map<number, FrameRequestCallback>();

    Object.defineProperty(window, "requestAnimationFrame", {
        configurable: true,
        value: vi.fn((callback: FrameRequestCallback) => {
            const id = nextFrameId++;
            callbacks.set(id, callback);
            return id;
        }),
    });
    Object.defineProperty(window, "cancelAnimationFrame", {
        configurable: true,
        value: vi.fn((id: number) => callbacks.delete(id)),
    });

    return {
        callbacks,
        flush() {
            const pending = [...callbacks.values()];
            callbacks.clear();
            pending.forEach((callback) => callback(0));
        },
    };
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

        if (originalRequestAnimationFrame) {
            Object.defineProperty(window, "requestAnimationFrame", originalRequestAnimationFrame);
        } else {
            Reflect.deleteProperty(window, "requestAnimationFrame");
        }
        if (originalCancelAnimationFrame) {
            Object.defineProperty(window, "cancelAnimationFrame", originalCancelAnimationFrame);
        } else {
            Reflect.deleteProperty(window, "cancelAnimationFrame");
        }
        if (originalIntersectionObserver) {
            Object.defineProperty(globalThis, "IntersectionObserver", originalIntersectionObserver);
        } else {
            Reflect.deleteProperty(globalThis, "IntersectionObserver");
        }
    });

    it("appears after scrolling down and is rendered outside the footer", () => {
        disableIntersectionObserver();
        const frames = mockAnimationFrames();
        render(<BackToTopButton />);
        act(() => frames.flush());

        expect(screen.queryByRole("button", { name: "footer.backToTop" })).not.toBeInTheDocument();

        setScrollY(400);
        fireEvent.scroll(window);
        act(() => frames.flush());

        const button = screen.getByRole("button", { name: "footer.backToTop" });
        expect(button).toBeInTheDocument();
        expect(button.closest("footer")).toBeNull();

        setScrollY(0);
        fireEvent.scroll(window);
        act(() => frames.flush());
        expect(screen.queryByRole("button", { name: "footer.backToTop" })).not.toBeInTheDocument();
    });

    it("coalesces multiple scroll events into one frame and updates visibility only at the threshold", () => {
        disableIntersectionObserver();
        const frames = mockAnimationFrames();
        render(<BackToTopButton />);
        act(() => frames.flush());

        setScrollY(200);
        fireEvent.scroll(window);
        setScrollY(400);
        fireEvent.scroll(window);

        // One frame checks the restored initial position; the two scroll events share one more.
        expect(window.requestAnimationFrame).toHaveBeenCalledTimes(2);
        expect(screen.queryByRole("button", { name: "footer.backToTop" })).not.toBeInTheDocument();

        act(() => frames.flush());

        expect(screen.getByRole("button", { name: "footer.backToTop" })).toBeInTheDocument();
    });

    it("uses an intersection sentinel to toggle visibility without scroll position reads", () => {
        let onIntersect: IntersectionObserverCallback | undefined;
        const observeMock = vi.fn();
        const disconnectMock = vi.fn();

        Object.defineProperty(globalThis, "IntersectionObserver", {
            configurable: true,
            value: class {
                constructor(callback: IntersectionObserverCallback) {
                    onIntersect = callback;
                }
                observe = observeMock;
                disconnect = disconnectMock;
            },
        });

        const { unmount } = render(<BackToTopButton />);

        expect(observeMock).toHaveBeenCalledWith(document.querySelector(".back-to-top__sentinel"));
        expect(screen.queryByRole("button", { name: "footer.backToTop" })).not.toBeInTheDocument();

        act(() => {
            onIntersect?.(
                [{ isIntersecting: false } as IntersectionObserverEntry],
                {} as IntersectionObserver,
            );
        });

        expect(screen.getByRole("button", { name: "footer.backToTop" })).toBeInTheDocument();

        act(() => {
            onIntersect?.(
                [{ isIntersecting: true } as IntersectionObserverEntry],
                {} as IntersectionObserver,
            );
        });

        expect(screen.queryByRole("button", { name: "footer.backToTop" })).not.toBeInTheDocument();
        unmount();
        expect(disconnectMock).toHaveBeenCalledOnce();
    });

    it("smoothly scrolls to the top when activated", () => {
        disableIntersectionObserver();
        const frames = mockAnimationFrames();
        const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
        setScrollY(400);
        setReducedMotion(false);

        render(<BackToTopButton />);
        act(() => frames.flush());
        fireEvent.click(screen.getByRole("button", { name: "footer.backToTop" }));

        expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });
    });

    it("uses an immediate scroll when reduced motion is preferred", () => {
        disableIntersectionObserver();
        const frames = mockAnimationFrames();
        const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
        setScrollY(400);
        setReducedMotion(true);

        render(<BackToTopButton />);
        act(() => frames.flush());
        fireEvent.click(screen.getByRole("button", { name: "footer.backToTop" }));

        expect(scrollTo).toHaveBeenCalledWith(0, 0);
    });
});
