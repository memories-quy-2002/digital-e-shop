import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "../../../context/LocaleContext";
import AsideShops from "../AsideShops";

const defaultProps = {
  products: [],
  filteredCount: 28,
  categories: ["Camera", "Graphics Card", "Laptop"],
  brands: [
    "AMD",
    "Apple",
    "Asus",
    "Bose",
    "Canon",
    "Dell",
    "Google",
    "HP",
    "Sony",
  ],
  filters: {
    term: "",
    categories: [] as string[],
    brands: [] as string[],
    priceRange: [2_000_000, 50_000_000] as [number, number],
  },
  priceBounds: [2_000_000, 50_000_000] as [number, number],
  onCheckboxChange: vi.fn(),
  onPriceRangeChange: vi.fn(),
  onApplyFilters: vi.fn(),
};

const renderAside = (locale: "en" | "vi" = "en") => {
  window.localStorage.setItem("digital-e:locale:v1", JSON.stringify(locale));

  return render(
    <LocaleProvider>
      <AsideShops {...defaultProps} />
    </LocaleProvider>,
  );
};

afterEach(() => {
  window.localStorage.removeItem("digital-e:locale:v1");
  vi.clearAllMocks();
});

describe("AsideShops", () => {
  it("localizes known catalog categories without changing their filter values", () => {
    renderAside("vi");

    const category = screen.getByRole("checkbox", { name: "Card đồ họa" });
    fireEvent.click(category);

    expect(defaultProps.onCheckboxChange).toHaveBeenCalledWith(
      "categories",
      "Graphics Card",
    );
  });

  it("searches brands and lets users reveal the full list", () => {
    renderAside();

    const brandSection = screen.getByTestId("shops__aside__brand");
    expect(within(brandSection).queryByText("Sony")).not.toBeInTheDocument();
    fireEvent.click(
      within(brandSection).getByRole("button", { name: "Show 3 more" }),
    );
    expect(within(brandSection).getByText("Sony")).toBeInTheDocument();

    fireEvent.change(
      within(brandSection).getByRole("searchbox", { name: "Search brands" }),
      {
        target: { value: "sony" },
      },
    );
    expect(within(brandSection).getByText("Sony")).toBeInTheDocument();
    expect(within(brandSection).queryByText("AMD")).not.toBeInTheDocument();
  });

  it("supports exact prices and quick ranges", () => {
    renderAside();

    fireEvent.change(
      screen.getByRole("spinbutton", { name: "Minimum price" }),
      {
        target: { value: "2500000" },
      },
    );
    fireEvent.blur(screen.getByRole("spinbutton", { name: "Minimum price" }));
    expect(defaultProps.onPriceRangeChange).toHaveBeenLastCalledWith([
      2_500_000, 50_000_000,
    ]);

    fireEvent.click(screen.getByRole("button", { name: "₫1M–₫5M" }));
    expect(defaultProps.onPriceRangeChange).toHaveBeenLastCalledWith([
      1_000_000, 5_000_000,
    ]);
  });
});
