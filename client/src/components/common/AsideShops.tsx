import React, { memo, useEffect, useId, useState } from "react";
import ReactSlider from "react-slider";
import { useT } from "../../hooks/useT";
import { Product } from "../../utils/interface";
import { formatCurrency, formatCurrencyNumber } from "../../utils/currency";

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

const BRAND_PREVIEW_COUNT = 6;
const PRICE_PRESET_LIMITS = [
  { key: "presetUnderMillion", lower: 0, upper: 1_000_000 },
  { key: "presetOneToFiveMillion", lower: 1_000_000, upper: 5_000_000 },
  { key: "presetFiveToTenMillion", lower: 5_000_000, upper: 10_000_000 },
  {
    key: "presetOverTenMillion",
    lower: 10_000_000,
    upper: Number.POSITIVE_INFINITY,
  },
] as const;

const AsideShops = ({
  products,
  filteredCount,
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
  const [priceDraft, setPriceDraft] = useState<[string, string]>([
    String(filters.priceRange[0]),
    String(filters.priceRange[1]),
  ]);
  const [brandSearch, setBrandSearch] = useState("");
  const [showAllBrands, setShowAllBrands] = useState(false);
  const panelId = useId().replace(/:/g, "");
  const visibleProductCount = filteredCount ?? products.length;
  const minimumPrice = 0;
  const sliderMax = Math.max(
    priceBounds[1],
    filters.priceRange[1],
    100_000_000,
  );
  const maximumPrice = sliderMax;
  const t = useT();

  useEffect(() => {
    setPriceRange(filters.priceRange);
    setPriceDraft([
      String(filters.priceRange[0]),
      String(filters.priceRange[1]),
    ]);
  }, [filters.priceRange]);

  const matchingBrands = brands.filter((brand) =>
    brand.toLocaleLowerCase().includes(brandSearch.trim().toLocaleLowerCase()),
  );
  const visibleBrands = brandSearch.trim()
    ? matchingBrands
    : showAllBrands
      ? brands
      : Array.from(
          new Set([...brands.slice(0, BRAND_PREVIEW_COUNT), ...filters.brands]),
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
      setPriceDraft([String(priceRange[0]), String(priceRange[1])]);
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
    setPriceDraft([String(nextRange[0]), String(nextRange[1])]);
    onPriceRangeChange(nextRange);
  };

  const applyPricePreset = (lower: number, upper: number) => {
    const nextRange: [number, number] = [lower, upper];
    setPriceRange(nextRange);
    setPriceDraft([String(lower), String(upper)]);
    onPriceRangeChange(nextRange);
  };

  const pricePresets = PRICE_PRESET_LIMITS.map((preset) => {
    const lower = Math.max(minimumPrice, preset.lower);
    const upper = Math.min(maximumPrice, preset.upper);
    return {
      ...preset,
      range: [lower, upper] as [number, number],
      disabled: lower > upper,
    };
  });

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
          {categories.map((category) => {
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
        {brands.length > BRAND_PREVIEW_COUNT ? (
          <label className="shops__brand-search">
            <span className="shops__sr-only">{t("shops.searchBrands")}</span>
            <input
              type="search"
              value={brandSearch}
              onChange={(event) => setBrandSearch(event.target.value)}
              placeholder={t("shops.searchBrands")}
              aria-label={t("shops.searchBrands")}
            />
          </label>
        ) : null}
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
          {brandSearch.trim() && matchingBrands.length === 0 ? (
            <p className="shops__brand-empty">{t("shops.noBrandsFound")}</p>
          ) : null}
        </div>
        {!brandSearch.trim() && hiddenBrandCount > 0 ? (
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
          <p>{t("shops.priceHelp")}</p>
        </div>
        <div className="shops__price-inputs">
          <label className="shops__price-input">
            <span>{t("shops.minPrice")}</span>
            <input
              type="number"
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
              inputMode="numeric"
              min={priceRange[0]}
              max={sliderMax}
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
        <div
          className="shops__price-presets"
          aria-label={t("shops.pricePresets")}
        >
          {pricePresets.map((preset) => (
            <button
              key={preset.key}
              type="button"
              disabled={preset.disabled}
              aria-pressed={
                priceRange[0] === preset.range[0] &&
                priceRange[1] === preset.range[1]
              }
              onClick={() => applyPricePreset(...preset.range)}
            >
              {t(`shops.${preset.key}`)}
            </button>
          ))}
        </div>
        <div className="shops__price-slider">
          <ReactSlider
            className="horizontal-slider"
            thumbClassName="example-thumb"
            trackClassName="example-track"
            value={priceRange}
            min={minimumPrice}
            max={sliderMax}
            pearling
            minDistance={150}
            renderThumb={(props, state) => {
              // react-slider includes an internal key in its props object; pass it explicitly.
              // eslint-disable-next-line react/prop-types
              const { key, ...thumbProps } = props;
              return (
                <div
                  key={key}
                  {...thumbProps}
                  aria-label={t(
                    state.index === 0
                      ? "shops.minimumPrice"
                      : "shops.maximumPrice",
                  )}
                  aria-valuetext={formatCurrency(state.valueNow)}
                >
                  <span>{formatCurrencyNumber(state.valueNow)} ₫</span>
                </div>
              );
            }}
            onChange={(newValue) => {
              const nextRange = newValue as [number, number];
              setPriceRange(nextRange);
              setPriceDraft([String(nextRange[0]), String(nextRange[1])]);
            }}
            onAfterChange={(newValue) =>
              onPriceRangeChange(newValue as [number, number])
            }
          />
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
      <div className="shops__filters-header">
        <div>
          <span>{t("shops.filtersKicker")}</span>
          <h2>{t("shops.filtersTitle")}</h2>
        </div>
        <strong>{visibleProductCount}</strong>
      </div>
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
