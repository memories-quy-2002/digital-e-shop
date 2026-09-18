import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "../../../context/LocaleContext";
import AsideShops from "../AsideShops";

const props = {
    products: [],
    filteredCount: 0,
    categories: [],
    brands: [],
    filters: {
        term: "",
        categories: [],
        brands: [],
        priceRange: [0, 100_000_000] as [number, number],
    },
    priceBounds: [0, 100_000_000] as [number, number],
    onCheckboxChange: vi.fn(),
    onPriceRangeChange: vi.fn(),
    onApplyFilters: vi.fn(),
};

describe("AsideShops price range", () => {
    it("supports exact VND input values and quick ranges", () => {
        render(
            <LocaleProvider>
                <AsideShops {...props} />
            </LocaleProvider>,
        );

        const minimumInput = screen.getByRole("textbox", { name: /From/ });
        const maximumInput = screen.getByRole("textbox", { name: /To/ });

        expect(minimumInput).toHaveValue("0");
        expect(maximumInput).toHaveValue("100.000.000");

        fireEvent.change(minimumInput, { target: { value: "1500000" } });
        fireEvent.blur(minimumInput);

        expect(props.onPriceRangeChange).toHaveBeenLastCalledWith([1_500_000, 100_000_000]);

        fireEvent.click(screen.getByRole("button", { name: "Under ₫1M" }));

        expect(props.onPriceRangeChange).toHaveBeenLastCalledWith([0, 1_000_000]);
    });
});
