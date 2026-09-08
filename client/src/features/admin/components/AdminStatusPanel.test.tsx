import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import AdminStatusPanel from "./AdminStatusPanel";

describe("AdminStatusPanel", () => {
    it.each(["loading", "error", "empty"] as const)("renders the %s state", (variant) => {
        render(<AdminStatusPanel variant={variant} title="Nothing here" description="Try again later." />);
        expect(screen.getByText("Nothing here")).toBeInTheDocument();
        expect(screen.getByText("Try again later.")).toBeInTheDocument();
    });

    it("renders a retry action and marks errors as alerts", () => {
        const onRetry = vi.fn();
        render(<AdminStatusPanel variant="error" title="Load failed" description="Please retry." onRetry={onRetry} />);
        fireEvent.click(screen.getByRole("button", { name: "Retry" }));
        expect(onRetry).toHaveBeenCalledOnce();
        expect(screen.getByRole("alert")).toHaveTextContent("Load failed");
    });
});
