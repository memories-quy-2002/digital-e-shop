import React, { useEffect, useState } from "react";
import ReactSlider from "react-slider";
import { Product } from "../../utils/interface";

const MAX_PRICE_RANGE: number = 5000;

type Filters = {
    term: string;
    categories: string[];
    brands: string[];
    priceRange: [number, number];
};

interface AsideShopsProps {
    products: Product[];
    filters: Filters;
    onCheckboxChange: (type: "categories" | "brands", value: string) => void;
    onPriceRangeChange: (newValue: [number, number]) => void;
    onApplyFilters: () => void;
}

const AsideShops = ({
    products,
    filters,
    onCheckboxChange,
    onPriceRangeChange,
    onApplyFilters,
}: AsideShopsProps) => {
    const [categories, setCategories] = useState<string[]>([]);
    const [brands, setBrands] = useState<string[]>([]);
    const [priceRange, setPriceRange] = useState<[number, number]>(filters.priceRange);

    useEffect(() => {
        setPriceRange(filters.priceRange);
    }, [filters.priceRange]);

    useEffect(() => {
        // Build compact filter lists from the products currently available on the page.
        setCategories([...new Set(products.map((product) => product.category))]);
        setBrands([...new Set(products.map((product) => product.brand))]);
    }, [products]);

    return (
        <aside className="shops__container__aside">
            <section className="shops__container__aside__categories" aria-labelledby="shops-filter-categories">
                <div>
                    <h2 id="shops-filter-categories">Categories</h2>
                    {categories.map((category) => {
                        const checkboxId = `shops-category-${category.replace(/\s+/g, "-").toLowerCase()}`;
                        return (
                            <div key={category}>
                                <label className="container" htmlFor={checkboxId}>
                                    {category}
                                    <input
                                        type="checkbox"
                                        id={checkboxId}
                                        checked={filters.categories.includes(category)}
                                        onChange={() => onCheckboxChange("categories", category)}
                                    />
                                    <span className="checkmark"></span>
                                </label>
                            </div>
                        );
                    })}
                </div>
            </section>
            <section
                className="shops__container__aside__brands"
                data-testid="shops__aside__brand"
                aria-labelledby="shops-filter-brands"
            >
                <div>
                    <h2 id="shops-filter-brands">Brands</h2>
                    {brands.map((brand) => {
                        const checkboxId = `shops-brand-${brand.replace(/\s+/g, "-").toLowerCase()}`;
                        return (
                            <div key={brand}>
                                <label className="container" htmlFor={checkboxId}>
                                    {brand}
                                    <input
                                        type="checkbox"
                                        id={checkboxId}
                                        checked={filters.brands.includes(brand)}
                                        onChange={() => onCheckboxChange("brands", brand)}
                                    />
                                    <span className="checkmark"></span>
                                </label>
                            </div>
                        );
                    })}
                </div>
            </section>
            <section className="shops__container__aside__price" aria-labelledby="shops-filter-price">
                <div className="shops__container__aside__price__header">
                    <h2 id="shops-filter-price">Price range</h2>
                    <p>Choose the budget window that fits what you want to browse.</p>
                </div>
                <div className="shops__container__aside__price__summary" aria-live="polite">
                    <div>
                        <span>Min</span>
                        <strong>${priceRange[0]}</strong>
                    </div>
                    <div>
                        <span>Max</span>
                        <strong>${priceRange[1]}</strong>
                    </div>
                </div>
                <div className="shops__container__aside__price__slider">
                    <ReactSlider
                        className="horizontal-slider"
                        thumbClassName="example-thumb"
                        trackClassName="example-track"
                        value={priceRange}
                        min={0}
                        max={MAX_PRICE_RANGE}
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
                className="btn btn-info shops__container__aside__button"
                onClick={() => onApplyFilters()}
            >
                Apply
            </button>
        </aside>
    );
};

export default AsideShops;
