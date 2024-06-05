import React, { useEffect, useState } from "react";
import { Product } from "../../utils/interface";
import ReactSlider from "react-slider";

type AsideShopsProps = {
    products: Product[];
};

const AsideShops = ({ products }: AsideShopsProps) => {
    const [categories, setCategories] = useState<string[]>([]);
    const [brands, setBrands] = useState<string[]>([]);
    const [priceRange, setPriceRange] = useState<[number, number]>([0, 1500]);
    const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
    const [searchTerm, setSearchTerm] = useState<string>("");
    const handleCheckboxChange = (brand: string) => {
        const newSelectedBrands = [...selectedBrands];
        const index = newSelectedBrands.indexOf(brand);
        if (index > -1) {
            newSelectedBrands.splice(index, 1); // Remove if already selected
        } else {
            newSelectedBrands.push(brand); // Add if not selected
        }
        setSelectedBrands(newSelectedBrands);
    };
    useEffect(() => {
        setCategories([
            ...new Set(products.map((product) => product.category)),
        ]);
        setBrands([...new Set(products.map((product) => product.brand))]);
    }, [products]);
    console.log(priceRange);

    return (
        <div className="shops__container__aside">
            <div className="shops__container__aside__search">
                <input
                    type="text"
                    placeholder="Search product..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>
            <div className="shops__container__aside__categories">
                <div>
                    <h4>Categories</h4>
                    <ul>
                        {categories.map((category) => (
                            <li>
                                <a
                                    href={`/shops?category=${category.toLowerCase()}`}
                                >
                                    {category}
                                </a>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
            <div className="shops__container__aside__brands">
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
                                        checked={selectedBrands.includes(brand)}
                                        onChange={() =>
                                            handleCheckboxChange(brand)
                                        }
                                    />
                                    <span className="checkmark"></span>
                                </label>
                            </div>
                        );
                    })}
                </div>
            </div>
            <div className="shops__container__aside__price">
                <h4>Price range</h4>
                <div className="shops__container__aside__price__slider">
                    <ReactSlider
                        className="horizontal-slider"
                        thumbClassName="example-thumb"
                        trackClassName="example-track"
                        defaultValue={[0, 5000]}
                        min={0}
                        max={5000}
                        minDistance={100}
                        onChange={(priceRange: [number, number]) =>
                            setPriceRange(priceRange)
                        }
                    />
                    <div className="shops__container__aside__price__slider__num">
                        <span>{priceRange[0]}</span>
                        <span>{priceRange[1]}</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AsideShops;
