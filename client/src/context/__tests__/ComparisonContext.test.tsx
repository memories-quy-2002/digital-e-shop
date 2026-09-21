import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { ComparisonProvider, useComparison } from "../ComparisonContext";

const Probe = () => {
    const comparison = useComparison();
    return (
        <>
            <span data-testid="ids">{comparison.selectedIds.join(",")}</span>
            <span data-testid="can-compare">{String(comparison.canCompare)}</span>
            <button onClick={() => comparison.add(12, "Laptops")}>add-12</button>
            <button onClick={() => comparison.add(18, "Laptops")}>add-18</button>
            <button onClick={() => comparison.add(24, "Phones")}>add-phone</button>
            <button onClick={() => comparison.add(30, "Laptops")}>add-30</button>
            <button onClick={() => comparison.add(31, "Laptops")}>add-31</button>
            <button onClick={() => comparison.remove(12)}>remove-12</button>
            <button onClick={comparison.clear}>clear</button>
        </>
    );
};

const renderProbe = () => render(<ComparisonProvider><Probe /></ComparisonProvider>);

describe("ComparisonContext", () => {
    beforeEach(() => window.localStorage.clear());

    it("hydrates only four distinct positive integer ids", () => {
        window.localStorage.setItem("digital-e:comparison:v1", JSON.stringify([12, 12, -4, 18, 24, 30, 42]));
        renderProbe();

        expect(screen.getByTestId("ids")).toHaveTextContent("12,18,24,30");
        expect(screen.getByTestId("can-compare")).toHaveTextContent("true");
    });

    it("adds same-category products, rejects a different category, and enforces the limit", () => {
        renderProbe();
        fireEvent.click(screen.getByRole("button", { name: "add-12" }));
        expect(screen.getByTestId("can-compare")).toHaveTextContent("false");
        fireEvent.click(screen.getByRole("button", { name: "add-18" }));
        expect(screen.getByTestId("can-compare")).toHaveTextContent("true");
        fireEvent.click(screen.getByRole("button", { name: "add-phone" }));
        fireEvent.click(screen.getByRole("button", { name: "add-30" }));
        fireEvent.click(screen.getByRole("button", { name: "add-31" }));

        expect(screen.getByTestId("ids")).toHaveTextContent("12,18,30");
    });

    it("persists remove and clear actions", () => {
        renderProbe();
        fireEvent.click(screen.getByRole("button", { name: "add-12" }));
        fireEvent.click(screen.getByRole("button", { name: "add-18" }));
        fireEvent.click(screen.getByRole("button", { name: "remove-12" }));
        expect(screen.getByTestId("ids")).toHaveTextContent("18");
        expect(JSON.parse(window.localStorage.getItem("digital-e:comparison:v1") || "[]")).toEqual([18]);
        fireEvent.click(screen.getByRole("button", { name: "clear" }));
        expect(screen.getByTestId("ids")).toHaveTextContent("");
    });
});
