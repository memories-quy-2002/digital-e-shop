import { describe, it, expect, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import React from "react";
import ToastProvider, { useToast } from "../ToastContext";
import { LocaleProvider } from "../LocaleContext";

const errorExamples: Array<[string, string]> = [
    ["Request failed", "Please retry"],
    ["Error", "Something happened"],
    ["Invalid input", "Please check the value"],
    ["Unable to process", "Please retry"],
    ["Session expired", "Please sign in"],
    ["Missing resource", "Resource not found"],
];
const successExamples = ["success", "successfully", "added", "created", "updated"];

const Probe: React.FC = () => {
    const { toasts, addToast, removeToast } = useToast();
    return (
        <div>
            <span data-testid="count">{toasts.length}</span>
            <span data-testid="tones">{toasts.map((t) => t.tone).join(",")}</span>
            <button onClick={() => addToast("Success", "Product successfully created")}>add-success</button>
            <button onClick={() => addToast("Failed", "Something went wrong")}>add-error</button>
            <button onClick={() => addToast("Heads up", "Just so you know")}>add-info</button>
            <button onClick={() => addToast("Đã thêm", "Thêm vào giỏ hàng thành công", "success")}>add-explicit-success</button>
            <button onClick={() => addToast("Không thể tải", "Vui lòng thử lại", "error")}>add-explicit-error</button>
            {errorExamples.map(([title, body], index) => (
                <button key={`error-${index}`} onClick={() => addToast(title, body)}>error-example-{index}</button>
            ))}
            {successExamples.map((keyword) => (
                <button key={keyword} onClick={() => addToast(keyword, "Outcome recorded")}>success-example-{keyword}</button>
            ))}
            <button onClick={() => toasts[0] && removeToast(toasts[0].id)}>remove-first</button>
        </div>
    );
};

const renderWithProvider = (locale: "en" | "vi" = "en") => {
    window.localStorage.setItem("digital-e:locale:v1", JSON.stringify(locale));
    return render(
        <LocaleProvider>
        <ToastProvider>
            <Probe />
        </ToastProvider>
        </LocaleProvider>,
    );
};

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
        for (const index of errorExamples.map((_, currentIndex) => currentIndex)) {
            act(() => {
                screen.getByText(`error-example-${index}`).click();
            });
            const tones = screen.getByTestId("tones").textContent?.split(",") ?? [];
            expect(tones[tones.length - 1]).toBe("error");
        }
    });

    it("matches on common success keywords", () => {
        renderWithProvider();
        for (const keyword of successExamples) {
            act(() => {
                screen.getByText(`success-example-${keyword}`).click();
            });
            const tones = screen.getByTestId("tones").textContent?.split(",") ?? [];
            expect(tones[tones.length - 1]).toBe("success");
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

    it("keeps all notifications in one global notification rail", () => {
        renderWithProvider();
        act(() => {
            screen.getByText("add-success").click();
            screen.getByText("add-info").click();
            screen.getByText("add-error").click();
        });

        const rails = document.querySelectorAll(".app-toast");
        expect(rails).toHaveLength(1);
        expect(rails[0].parentElement).toBe(document.body);
        expect(rails[0]).toHaveClass("app-toast--open");
        expect(rails[0].querySelectorAll("[data-toast]")).toHaveLength(3);
        expect(screen.getByText("Information")).toBeInTheDocument();
        expect(screen.getByText("Action needed")).toBeInTheDocument();
    });

    it("uses explicit outcome tones and localized labels for non-English messages", async () => {
        renderWithProvider("vi");
        await screen.findByText("add-explicit-success");
        act(() => {
            screen.getByText("add-explicit-success").click();
            screen.getByText("add-explicit-error").click();
        });

        expect(screen.getByTestId("tones")).toHaveTextContent("success,error");
        expect(document.querySelector(".app-toast__item--success")).toBeInTheDocument();
        expect(document.querySelector(".app-toast__item--error")).toBeInTheDocument();
        expect(screen.getByText("Thành công")).toBeInTheDocument();
        expect(screen.getByText("Cần chú ý")).toBeInTheDocument();
    });

    it("caps the visible notification queue at three toasts", () => {
        renderWithProvider();
        act(() => {
            screen.getByText("add-success").click();
            screen.getByText("add-info").click();
            screen.getByText("add-error").click();
            screen.getByText("add-success").click();
        });

        expect(screen.getByTestId("count").textContent).toBe("3");
        expect(document.querySelectorAll("[data-toast]")).toHaveLength(3);
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
