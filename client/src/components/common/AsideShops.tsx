import React, { memo, useEffect, useState } from "react";
import { Product } from "../../utils/interface";
import { formatCurrencyNumber } from "../../utils/currency";
import { useT } from "../../hooks/useT";
import { getProductCategoryLabel } from "../../utils/productCategory";

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
    onCheckboxChange: (type: "categories" | "brands", value: string) => void;
    onPriceRangeChange: (newValue: [number, number]) => void;
    onApplyFilters: () => void;
}

const FILTER_OPTION_LIMIT = 6;
const PRICE_PRESETS = [
    { key: "shops.presetUnderMillion", min: 0, max: 1_000_000 },
    { key: "shops.presetOneToFiveMillion", min: 1_000_000, max: 5_000_000 },
    { key: "shops.presetFiveToTenMillion", min: 5_000_000, max: 10_000_000 },
    { key: "shops.presetOverTenMillion", min: 10_000_000, max: Number.MAX_SAFE_INTEGER },
] as const;

const AsideShops = ({
    products,
    filteredCount,
    categories,
    brands,
    filters,
    priceBounds,
    onCheckboxChange,
    onPriceRangeChange,
    onApplyFilters,
}: AsideShopsProps) => {
    const [priceRange, setPriceRange] = useState<[number, number]>(filters.priceRange);
    const [priceInputValues, setPriceInputValues] = useState<[string, string]>([
        formatCurrencyNumber(filters.priceRange[0]),
        formatCurrencyNumber(filters.priceRange[1]),
    ]);
    const visibleProductCount = filteredCount || products.length;
    const t = useT();
    const minimumPriceBound = Math.max(0, priceBounds[0]);
    const maximumPriceBound = Math.max(minimumPriceBound, priceBounds[1]);
    const [showAllCategories, setShowAllCategories] = useState(false);
    const [showAllBrands, setShowAllBrands] = useState(false);
    const hasHiddenSelectedCategory = filters.categories.some(
        (category) => !categories.slice(0, FILTER_OPTION_LIMIT).includes(category),
    );
    const hasHiddenSelectedBrand = filters.brands.some(
        (brand) => !brands.slice(0, FILTER_OPTION_LIMIT).includes(brand),
    );
    const visibleCategories = showAllCategories || hasHiddenSelectedCategory
        ? categories
        : categories.slice(0, FILTER_OPTION_LIMIT);
    const visibleBrands = showAllBrands || hasHiddenSelectedBrand ? brands : brands.slice(0, FILTER_OPTION_LIMIT);

    useEffect(() => {
        setPriceRange(filters.priceRange);
        setPriceInputValues([
            formatCurrencyNumber(filters.priceRange[0]),
            formatCurrencyNumber(filters.priceRange[1]),
        ]);
    }, [filters.priceRange]);

    const commitPriceInput = (index: 0 | 1) => {
        const fallbackValue = index === 0 ? minimumPriceBound : maximumPriceBound;
        const parsedValue = priceInputValues[index] === "" ? fallbackValue : Number(priceInputValues[index]);
        const boundedValue = Number.isFinite(parsedValue)
            ? Math.min(maximumPriceBound, Math.max(minimumPriceBound, parsedValue))
            : fallbackValue;
        const nextRange: [number, number] = [...priceRange];

        if (index === 0) {
            nextRange[0] = Math.min(boundedValue, nextRange[1]);
        } else {
            nextRange[1] = Math.max(boundedValue, nextRange[0]);
        }

        setPriceRange(nextRange);
        setPriceInputValues([
            formatCurrencyNumber(nextRange[0]),
            formatCurrencyNumber(nextRange[1]),
        ]);
        onPriceRangeChange(nextRange);
    };

    const applyPricePreset = (presetMin: number, presetMax: number) => {
        const nextRange: [number, number] = [
            Math.max(minimumPriceBound, presetMin),
            Math.min(maximumPriceBound, presetMax),
        ];

        setPriceRange(nextRange);
        setPriceInputValues([
            formatCurrencyNumber(nextRange[0]),
            formatCurrencyNumber(nextRange[1]),
        ]);
        onPriceRangeChange(nextRange);
    };

    return (
        <div className="shops__filters">
            <div className="shops__filters-header">
                <div>
                    <span>{t("shops.filtersKicker")}</span>
                    <h2>{t("shops.filtersTitle")}</h2>
                </div>
                <strong>{visibleProductCount}</strong>
            </div>

            <section className="shops__filter-section shops__filter-section--categories" aria-labelledby="shops-filter-categories">
                <div className="shops__filter-section-header">
                    <h2 id="shops-filter-categories">{t("shops.categories")}</h2>
                    <span>{categories.length}</span>
                </div>
                <div className="shops__filter-options">
                    {visibleCategories.map((category) => {
                        const checkboxId = `shops-category-${category.replace(/\s+/g, "-").toLowerCase()}`;
                        const isChecked = filters.categories.includes(category);
                        return (
                            <div key={category}>
                                <label className={`shops__filter-option${isChecked ? " is-checked" : ""}`} htmlFor={checkboxId}>
                                    <input
                                        type="checkbox"
                                        id={checkboxId}
                                        checked={isChecked}
                                        onChange={() => onCheckboxChange("categories", category)}
                                    />
                                    <span className="shops__filter-checkmark" aria-hidden="true"></span>
                                    <span className="shops__filter-label">{getProductCategoryLabel(category, t)}</span>
                                </label>
                            </div>
                        );
                    })}
                </div>
                {categories.length > FILTER_OPTION_LIMIT ? (
                    <button
                        type="button"
                        className="shops__filter-toggle"
                        aria-expanded={showAllCategories || hasHiddenSelectedCategory}
                        onClick={() => setShowAllCategories((current) => !current)}
                    >
                        {showAllCategories || hasHiddenSelectedCategory
                            ? t("shops.showLess")
                            : t("shops.showMore", categories.length - FILTER_OPTION_LIMIT)}
                    </button>
                ) : null}
            </section>
            <section
                className="shops__filter-section shops__filter-section--brands"
                data-testid="shops__aside__brand"
                aria-labelledby="shops-filter-brands"
            >
                <div className="shops__filter-section-header">
                    <h2 id="shops-filter-brands">{t("shops.brands")}</h2>
                    <span>{brands.length}</span>
                </div>
                <div className="shops__filter-options">
                    {visibleBrands.map((brand) => {
                        const checkboxId = `shops-brand-${brand.replace(/\s+/g, "-").toLowerCase()}`;
                        const isChecked = filters.brands.includes(brand);
                        return (
                            <div key={brand}>
                                <label className={`shops__filter-option${isChecked ? " is-checked" : ""}`} htmlFor={checkboxId}>
                                    <input
                                        type="checkbox"
                                        id={checkboxId}
                                        checked={isChecked}
                                        onChange={() => onCheckboxChange("brands", brand)}
                                    />
                                    <span className="shops__filter-checkmark" aria-hidden="true"></span>
                                    <span className="shops__filter-label">{brand}</span>
                                </label>
                            </div>
                        );
                    })}
                </div>
                {brands.length > FILTER_OPTION_LIMIT ? (
                    <button
                        type="button"
                        className="shops__filter-toggle"
                        aria-expanded={showAllBrands || hasHiddenSelectedBrand}
                        onClick={() => setShowAllBrands((current) => !current)}
                    >
                        {showAllBrands || hasHiddenSelectedBrand
                            ? t("shops.showLess")
                            : t("shops.showMore", brands.length - FILTER_OPTION_LIMIT)}
                    </button>
                ) : null}
            </section>
            <section className="shops__filter-section shops__filter-section--price" aria-labelledby="shops-filter-price">
                <div className="shops__price-header">
                    <h2 id="shops-filter-price">{t("shops.priceRange")}</h2>
                    <p id="shops-price-help">{t("shops.priceHelp")}</p>
                </div>
                <div className="shops__price-inputs">
                    {([0, 1] as const).map((index) => (
                        <label className="shops__price-input-field" htmlFor={`shops-price-${index === 0 ? "min" : "max"}`} key={index}>
                            <span>{t(index === 0 ? "shops.minPrice" : "shops.maxPrice")}</span>
                            <span className="shops__price-input-wrap">
                                <input
                                    id={`shops-price-${index === 0 ? "min" : "max"}`}
                                    type="text"
                                    inputMode="numeric"
                                    pattern="[0-9]*"
                                    value={priceInputValues[index]}
                                    aria-describedby="shops-price-help"
                                    onFocus={() => setPriceInputValues((current) => {
                                        const next = [...current] as [string, string];
                                        next[index] = String(priceRange[index]);
                                        return next;
                                    })}
                                    onChange={(event) => setPriceInputValues((current) => {
                                        const next = [...current] as [string, string];
                                        next[index] = event.target.value.replace(/[^0-9]/g, "");
                                        return next;
                                    })}
                                    onBlur={() => commitPriceInput(index)}
                                    onKeyDown={(event) => {
                                        if (event.key === "Enter") {
                                            event.currentTarget.blur();
                                        }
                                    }}
                                />
                                <span aria-hidden="true">₫</span>
                            </span>
                        </label>
                    ))}
                </div>
                <div className="shops__price-presets">
                    <span className="shops__price-presets-label">{t("shops.pricePresets")}</span>
                    <div className="shops__price-preset-list">
                        {PRICE_PRESETS.map((preset) => {
                            const available = preset.max >= minimumPriceBound && preset.min <= maximumPriceBound;
                            const selected = priceRange[0] === Math.max(minimumPriceBound, preset.min)
                                && priceRange[1] === Math.min(maximumPriceBound, preset.max);

                            return (
                                <button
                                    key={preset.key}
                                    type="button"
                                    className={`shops__price-preset${selected ? " is-selected" : ""}`}
                                    disabled={!available}
                                    aria-pressed={selected}
                                    onClick={() => applyPricePreset(preset.min, preset.max)}
                                >
                                    {t(preset.key)}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </section>
            <button
                type="button"
                className="shops__filters-button"
                onClick={() => onApplyFilters()}
            >
                {t("shops.applyFilters")}
            </button>
        </div>
    );
};

export default memo(AsideShops);
