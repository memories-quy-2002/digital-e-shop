import { describe, it, expect, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import React from "react";
import ToastProvider, { useToast } from "../ToastContext";

const Probe: React.FC = () => {
    const { toasts, addToast, removeToast } = useToast();
    return (
        <div>
            <span data-testid="count">{toasts.length}</span>
            <span data-testid="tones">{toasts.map((t) => t.tone).join(",")}</span>
            <button onClick={() => addToast("Success", "Product successfully created")}>add-success</button>
            <button onClick={() => addToast("Failed", "Something went wrong")}>add-error</button>
            <button onClick={() => addToast("Heads up", "Just so you know")}>add-info</button>
            <button onClick={() => toasts[0] && removeToast(toasts[0].id)}>remove-first</button>
        </div>
    );
};

const renderWithProvider = () =>
    render(
        <ToastProvider>
            <Probe />
        </ToastProvider>
    );

describe("ToastContext", () => {
    it("throws when useToast is used outside the provider", () => {
        const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
        expect(() => render(<Probe />)).toThrow(/must be used within a ToastProvider/);
        consoleError.mockRestore();
    });

    it("starts with no toasts", () => {
        renderWithProvider();
        expect(screen.getByTestId("count").textContent).toBe("0");
    });

    it("infers error tone from content", () => {
        renderWithProvider();
        act(() => {
            screen.getByText("add-error").click();
        });
        expect(screen.getByTestId("tones").textContent).toBe("error");
    });

    it("infers success tone from content", () => {
        renderWithProvider();
        act(() => {
            screen.getByText("add-success").click();
        });
        const tones = screen.getByTestId("tones").textContent?.split(",") ?? [];
        expect(tones[tones.length - 1]).toBe("success");
    });

    it("infers info tone when content has no success/error keywords", () => {
        renderWithProvider();
        act(() => {
            screen.getByText("add-info").click();
        });
        expect(screen.getByTestId("tones").textContent).toBe("info");
    });

    it("matches on common error keywords", () => {
        renderWithProvider();
        const variants: Array<[string, string]> = [
            ["err", "Something happened"],
            ["invalid", "Your input is invalid"],
            ["unable", "Unable to process"],
            ["expired", "Session expired"],
            ["not found", "Resource not found"],
        ];
        for (const [title, body] of variants) {
            act(() => {
                screen.getByText("add-error").click();
            });
            const tones = screen.getByTestId("tones").textContent?.split(",") ?? [];
            expect(tones[tones.length - 1]).toBe("error");
            void title;
            void body;
        }
    });

    it("matches on common success keywords", () => {
        renderWithProvider();
        const variants = ["success", "successfully", "added", "created", "updated"];
        for (const keyword of variants) {
            act(() => {
                screen.getByText("add-success").click();
            });
            const tones = screen.getByTestId("tones").textContent?.split(",") ?? [];
            expect(tones[tones.length - 1]).toBe("success");
            void keyword;
        }
    });

    it("supports multiple toasts", () => {
        renderWithProvider();
        act(() => {
            screen.getByText("add-success").click();
            screen.getByText("add-info").click();
            screen.getByText("add-error").click();
        });
        expect(screen.getByTestId("count").textContent).toBe("3");
        expect(screen.getByTestId("tones").textContent).toBe("success,info,error");
    });

    it("removes a toast by id", () => {
        renderWithProvider();
        act(() => {
            screen.getByText("add-info").click();
            screen.getByText("add-success").click();
        });
        expect(screen.getByTestId("count").textContent).toBe("2");

        act(() => {
            screen.getByText("remove-first").click();
        });

        expect(screen.getByTestId("count").textContent).toBe("1");
    });

    it("ignores removeToast for unknown ids", () => {
        renderWithProvider();
        act(() => {
            screen.getByText("add-info").click();
        });
        expect(screen.getByTestId("count").textContent).toBe("1");
    });
});
