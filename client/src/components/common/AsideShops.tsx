import React, { memo, useEffect, useId, useState } from "react";
import { useT } from "../../hooks/useT";
import { Product } from "../../utils/interface";

type Filters = {
  term: string;
  categories: string[];
  brands: string[];
  priceRange: [number, number];
};

interface AsideShopsProps {
  products: Product[];
  filteredCount: number;
  categories: string[];
  brands: string[];
  filters: Filters;
  priceBounds: [number, number];
  variant?: "sidebar" | "sheet";
  onCheckboxChange: (type: "categories" | "brands", value: string) => void;
  onPriceRangeChange: (newValue: [number, number]) => void;
  onApplyFilters: () => void;
}

const CATEGORY_TRANSLATION_KEYS: Record<string, string> = {
  camera: "categoryCamera",
  console: "categoryConsole",
  "graphics card": "categoryGraphicsCard",
  headphone: "categoryHeadphone",
  headphones: "categoryHeadphone",
  laptop: "categoryLaptop",
  monitor: "categoryMonitor",
  pc: "categoryPc",
  smartphone: "categorySmartphone",
};

export const getShopCategoryLabel = (
  category: string,
  translate: (key: string) => string,
): string => {
  const normalized = category.trim().replace(/\s+/g, " ").toLowerCase();
  const translationKey = CATEGORY_TRANSLATION_KEYS[normalized];
  return translationKey ? translate(`shops.${translationKey}`) : category;
};

const FILTER_PREVIEW_COUNT = 6;
const AsideShops = ({
  categories,
  brands,
  filters,
  priceBounds,
  variant = "sidebar",
  onCheckboxChange,
  onPriceRangeChange,
  onApplyFilters,
}: AsideShopsProps) => {
  const [priceRange, setPriceRange] = useState<[number, number]>(
    filters.priceRange,
  );
  const [priceDraft, setPriceDraft] = useState<[string, string]>(["", ""]);
  const [showAllCategories, setShowAllCategories] = useState(false);
  const [showAllBrands, setShowAllBrands] = useState(false);
  const panelId = useId().replace(/:/g, "");
  const minimumPrice = 0;
  const maximumPrice = Math.max(
    priceBounds[1],
    filters.priceRange[1],
    100_000_000,
  );
  const t = useT();

  useEffect(() => {
    setPriceRange(filters.priceRange);
    setPriceDraft(["", ""]);
  }, [filters.priceRange]);

  const visibleCategories = showAllCategories
    ? categories
    : Array.from(
        new Set([
          ...categories.slice(0, FILTER_PREVIEW_COUNT),
          ...filters.categories,
        ]),
      );
  const hiddenCategoryCount = categories.filter(
    (category) => !visibleCategories.includes(category),
  ).length;
  const visibleBrands = showAllBrands
    ? brands
    : Array.from(
        new Set([...brands.slice(0, FILTER_PREVIEW_COUNT), ...filters.brands]),
      );
  const hiddenBrandCount = brands.filter(
    (brand) => !visibleBrands.includes(brand),
  ).length;

  const handlePriceDraftChange = (index: 0 | 1, value: string) => {
    setPriceDraft((current) => {
      const next = [...current] as [string, string];
      next[index] = value;
      return next;
    });
  };

  const commitPriceDraft = (index: 0 | 1) => {
    const rawValue = priceDraft[index];
    if (rawValue.trim() === "" || !Number.isFinite(Number(rawValue))) {
      setPriceDraft((current) => {
        const next = [...current] as [string, string];
        next[index] = "";
        return next;
      });
      return;
    }

    const value = Math.min(
      maximumPrice,
      Math.max(minimumPrice, Math.round(Number(rawValue))),
    );
    const nextRange: [number, number] = [...priceRange];
    if (index === 0) {
      nextRange[0] = Math.min(value, nextRange[1]);
    } else {
      nextRange[1] = Math.max(value, nextRange[0]);
    }

    setPriceRange(nextRange);
    setPriceDraft((current) => {
      const next = [...current] as [string, string];
      next[index] = "";
      return next;
    });
    onPriceRangeChange(nextRange);
  };

  const filterSections = (
    <>
      <section
        className="shops__filter-section shops__filter-section--categories"
        aria-labelledby={`${panelId}-categories`}
      >
        <div className="shops__filter-section-header">
          <h2 id={`${panelId}-categories`}>{t("shops.categories")}</h2>
          <span>{categories.length}</span>
        </div>
        <div className="shops__filter-options">
          {visibleCategories.map((category) => {
            const checkboxId = `${panelId}-category-${category.replace(/\s+/g, "-").toLowerCase()}`;
            return (
              <div key={category}>
                <label className="shops__filter-option" htmlFor={checkboxId}>
                  <input
                    type="checkbox"
                    id={checkboxId}
                    checked={filters.categories.includes(category)}
                    onChange={() => onCheckboxChange("categories", category)}
                  />
                  <span className="shops__filter-checkmark"></span>
                  <span className="shops__filter-label">
                    {getShopCategoryLabel(category, t)}
                  </span>
                </label>
              </div>
            );
          })}
        </div>
        {hiddenCategoryCount > 0 || showAllCategories ? (
          <button
            type="button"
            className="shops__brands-toggle"
            onClick={() => setShowAllCategories((current) => !current)}
          >
            {showAllCategories
              ? t("shops.showLess")
              : t("shops.showMore", hiddenCategoryCount)}
          </button>
        ) : null}
      </section>
      <section
        className="shops__filter-section shops__filter-section--brands"
        data-testid="shops__aside__brand"
        aria-labelledby={`${panelId}-brands`}
      >
        <div className="shops__filter-section-header">
          <h2 id={`${panelId}-brands`}>{t("shops.brands")}</h2>
          <span>{brands.length}</span>
        </div>
        <div className="shops__filter-options">
          {visibleBrands.map((brand) => {
            const checkboxId = `${panelId}-brand-${brand.replace(/\s+/g, "-").toLowerCase()}`;
            return (
              <div key={brand}>
                <label className="shops__filter-option" htmlFor={checkboxId}>
                  <input
                    type="checkbox"
                    id={checkboxId}
                    checked={filters.brands.includes(brand)}
                    onChange={() => onCheckboxChange("brands", brand)}
                  />
                  <span className="shops__filter-checkmark"></span>
                  <span className="shops__filter-label">{brand}</span>
                </label>
              </div>
            );
          })}
        </div>
        {hiddenBrandCount > 0 || showAllBrands ? (
          <button
            type="button"
            className="shops__brands-toggle"
            onClick={() => setShowAllBrands((current) => !current)}
          >
            {showAllBrands
              ? t("shops.showLess")
              : t("shops.showMore", hiddenBrandCount)}
          </button>
        ) : null}
      </section>
      <section
        className="shops__filter-section shops__filter-section--price"
        aria-labelledby={`${panelId}-price`}
      >
        <div className="shops__price-header">
          <h2 id={`${panelId}-price`}>{t("shops.priceRange")}</h2>
        </div>
        <div className="shops__price-inputs">
          <label className="shops__price-input">
            <span>{t("shops.minPrice")}</span>
            <input
              type="number"
              placeholder="0"
              inputMode="numeric"
              min={minimumPrice}
              max={priceRange[1]}
              step="1"
              value={priceDraft[0]}
              aria-label={t("shops.minimumPrice")}
              onChange={(event) =>
                handlePriceDraftChange(0, event.target.value)
              }
              onBlur={() => commitPriceDraft(0)}
            />
          </label>
          <label className="shops__price-input">
            <span>{t("shops.maxPrice")}</span>
            <input
              type="number"
              placeholder="Max"
              inputMode="numeric"
              min={priceRange[0]}
              max={maximumPrice}
              step="1"
              value={priceDraft[1]}
              aria-label={t("shops.maximumPrice")}
              onChange={(event) =>
                handlePriceDraftChange(1, event.target.value)
              }
              onBlur={() => commitPriceDraft(1)}
            />
          </label>
        </div>
      </section>
    </>
  );

  if (variant === "sheet") {
    return (
      <div className="shops__filters-content shops__filters-content--sheet">
        {filterSections}
      </div>
    );
  }

  return (
    <aside className="shops__filters" aria-label={t("shops.filtersTitle")}>
      <div className="shops__filters-content">{filterSections}</div>
      <button
        type="button"
        className="shops__filters-button"
        onClick={onApplyFilters}
      >
        {t("shops.applyFilters")}
      </button>
    </aside>
  );
};

export default memo(AsideShops);
