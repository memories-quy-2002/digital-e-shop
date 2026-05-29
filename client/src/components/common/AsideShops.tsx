import React, { memo, useEffect, useState } from "react";
import ReactSlider from "react-slider";
import { Product } from "../../utils/interface";

type Filters = {
    term: string;
    categories: string[];
    brands: string[];
    priceRange: [number, number];
};

interface AsideShopsProps {
    products: Product[];
    categories: string[];
    brands: string[];
    filters: Filters;
    onCheckboxChange: (type: "categories" | "brands", value: string) => void;
    onPriceRangeChange: (newValue: [number, number]) => void;
    onApplyFilters: () => void;
}

const AsideShops = ({
    products,
    categories,
    brands,
    filters,
    onCheckboxChange,
    onPriceRangeChange,
    onApplyFilters,
}: AsideShopsProps) => {
    const [priceRange, setPriceRange] = useState<[number, number]>(filters.priceRange);
    const visibleProductCount = products.length;
    const sliderMax = Math.max(filters.priceRange[1], 5000);

    useEffect(() => {
        setPriceRange(filters.priceRange);
    }, [filters.priceRange]);

    return (
        <aside className="shops__filters">
            <div className="shops__filters-header">
                <div>
                    <span>Catalog filters</span>
                    <h2>Refine products</h2>
                </div>
                <strong>{visibleProductCount}</strong>
            </div>

            <section className="shops__filter-section shops__filter-section--categories" aria-labelledby="shops-filter-categories">
                <div className="shops__filter-section-header">
                    <h2 id="shops-filter-categories">Categories</h2>
                    <span>{categories.length}</span>
                </div>
                <div className="shops__filter-options">
                    {categories.map((category) => {
                        const checkboxId = `shops-category-${category.replace(/\s+/g, "-").toLowerCase()}`;
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
                                    <span className="shops__filter-label">{category}</span>
                                </label>
                            </div>
                        );
                    })}
                </div>
            </section>
            <section
                className="shops__filter-section shops__filter-section--brands"
                data-testid="shops__aside__brand"
                aria-labelledby="shops-filter-brands"
            >
                <div className="shops__filter-section-header">
                    <h2 id="shops-filter-brands">Brands</h2>
                    <span>{brands.length}</span>
                </div>
                <div className="shops__filter-options">
                    {brands.map((brand) => {
                        const checkboxId = `shops-brand-${brand.replace(/\s+/g, "-").toLowerCase()}`;
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
            </section>
            <section className="shops__filter-section shops__filter-section--price" aria-labelledby="shops-filter-price">
                <div className="shops__price-header">
                    <h2 id="shops-filter-price">Price range</h2>
                    <p>Choose the budget window that fits what you want to browse.</p>
                </div>
                <div className="shops__price-summary" aria-live="polite">
                    <div>
                        <span>Min</span>
                        <strong>${priceRange[0]}</strong>
                    </div>
                    <div>
                        <span>Max</span>
                        <strong>${priceRange[1]}</strong>
                    </div>
                </div>
                <div className="shops__price-slider">
                    <ReactSlider
                        className="horizontal-slider"
                        thumbClassName="example-thumb"
                        trackClassName="example-track"
                        value={priceRange}
                        min={0}
                        max={sliderMax}
                        pearling
                        minDistance={150}
                        renderThumb={(props, state) => (
                            <div
                                {...props}
                                aria-label={state.index === 0 ? "Minimum price" : "Maximum price"}
                                aria-valuetext={`$${state.valueNow}`}
                            >
                                <span>${state.valueNow}</span>
                            </div>
                        )}
                        onChange={(newValue) => setPriceRange(newValue as [number, number])}
                        onAfterChange={(newValue) => onPriceRangeChange(newValue as [number, number])}
                    />
                </div>
            </section>
            <button
                type="button"
                className="btn btn-info shops__filters-button"
                onClick={() => onApplyFilters()}
            >
                Apply
            </button>
        </aside>
    );
};

export default memo(AsideShops);
