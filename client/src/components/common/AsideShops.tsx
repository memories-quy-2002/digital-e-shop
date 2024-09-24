import { useEffect, useState } from "react";
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
    onTermChange: (e: React.ChangeEvent<HTMLInputElement>) => void; // Add this prop
}

const AsideShops = ({
    products,
    filters,
    onCheckboxChange,
    onPriceRangeChange,
    onApplyFilters,
    onTermChange,
}: AsideShopsProps) => {
    const [categories, setCategories] = useState<string[]>([]);
    const [brands, setBrands] = useState<string[]>([]);

    useEffect(() => {
        setCategories([...new Set(products.map((product) => product.category))]);
        setBrands([...new Set(products.map((product) => product.brand))]);
    }, [products]);
    console.log(products);
    console.log("Filter: ", filters);

    return (
        <aside className="shops__container__aside">
            <section className="shops__container__aside__search">
                <input
                    type="text"
                    placeholder="Search product..."
                    value={filters.term}
                    onChange={onTermChange}
                    onKeyDown={(event) => {
                        if (event.key === "Enter") {
                            onApplyFilters();
                        }
                    }}
                />
            </section>
            <section className="shops__container__aside__categories">
                <div>
                    <h4>Categories</h4>
                    {categories.map((category, index) => {
                        return (
                            <div key={index}>
                                <label className="container">
                                    {category}
                                    <input
                                        type="checkbox"
                                        id={category}
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
            <section className="shops__container__aside__brands" data-testid="shops__aside__brand">
                <div>
                    <h4>Brands</h4>
                    {brands.map((brand, index) => {
                        return (
                            <div key={index}>
                                <label className="container">
                                    {brand}
                                    <input
                                        type="checkbox"
                                        id={brand}
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
            <section className="shops__container__aside__price">
                <h4>Price range</h4>
                <div className="shops__container__aside__price__slider">
                    <ReactSlider
                        className="horizontal-slider"
                        thumbClassName="example-thumb"
                        trackClassName="example-track"
                        defaultValue={[0, MAX_PRICE_RANGE]}
                        min={0}
                        max={MAX_PRICE_RANGE}
                        minDistance={100}
                        onAfterChange={(newValue: [number, number]) => onPriceRangeChange(newValue)}
                    />
                    <div className="shops__container__aside__price__slider__num">
                        <span>{filters.priceRange[0]}</span>
                        <span>{filters.priceRange[1]}</span>
                    </div>
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
