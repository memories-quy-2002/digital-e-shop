import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import AdminTableScrollHint from "./AdminTableScrollHint";

describe("AdminTableScrollHint", () => {
    it("exposes a focusable labelled region and horizontal-scroll guidance", () => {
        render(
            <AdminTableScrollHint label="Order list">
                <table><tbody><tr><td>Order</td></tr></tbody></table>
            </AdminTableScrollHint>,
        );

        const region = screen.getByRole("region", { name: "Order list" });
        expect(region).toHaveAttribute("tabindex", "0");
        expect(screen.getByText("Swipe horizontally to view more columns.")).toBeInTheDocument();
        expect(screen.getByRole("table")).toBeInTheDocument();
    });
});

