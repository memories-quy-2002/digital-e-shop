import React, { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import axios from "../../api/axios";
import "../../styles/ShopsPage.scss";
import { Product } from "../../utils/interface";
import AsideShops from "../common/AsideShops";
import PaginatedItems from "../common/PaginatedItems";
import Layout from "../layout/Layout";
import { Helmet } from "react-helmet";
import { useAuth } from "../../context/AuthContext";

const MAX_PRICE_RANGE: number = 5000;
const ITEMS_PER_PAGE = 6;

type Wishlist = {
    id: number;
    product: Product;
};

type Filters = {
    term: string;
    categories: string[];
    brands: string[];
    priceRange: [number, number];
    sortBy: "relevance" | "price-asc" | "price-desc" | "rating-desc";
};

const ShopsPage = () => {
    const [products, setProducts] = useState<Product[]>([]);
    const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [wishlist, setWishlist] = useState<Wishlist[]>([]);
    const [filters, setFilters] = useState<Filters>({
        term: "",
        categories: [],
        brands: [],
        priceRange: [0, MAX_PRICE_RANGE],
        sortBy: "relevance",
    });

    const navigate = useNavigate();
    const location = useLocation();
    const { userData } = useAuth();
    const uid = userData?.id || "";

    const updateURL = useCallback(
        (newFilters: Filters) => {
            const queryParams = new URLSearchParams({
                categories: newFilters.categories.join(","),
                brands: newFilters.brands.join(","),
                minPrice: newFilters.priceRange[0].toString(),
                maxPrice: newFilters.priceRange[1].toString(),
                term: newFilters.term,
                sortBy: newFilters.sortBy,
            });
            navigate(`${location.pathname}?${queryParams.toString()}`, { replace: true });
        },
        [navigate, location.pathname],
    );

    // Optimized filter handlers
    const handleTermChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const trimmedValue = e.target.value.trim();
        setFilters((prev) => ({ ...prev, term: trimmedValue }));
    }, []);

    const handleCheckboxChange = useCallback((type: "categories" | "brands", value: string) => {
        setFilters((prev) => ({
            ...prev,
            [type]: prev[type].includes(value) ? prev[type].filter((item) => item !== value) : [...prev[type], value],
        }));
    }, []);

    const handlePriceRangeChange = useCallback((newValue: [number, number]) => {
        setFilters((prev) => ({ ...prev, priceRange: newValue }));
    }, []);

    const getFilteredProducts = useCallback((filters: Filters, allProducts: Product[]): Product[] => {
        const { term, categories, brands, priceRange } = filters;
        const termLower = term.trim().toLowerCase();

        return allProducts.filter((product) => {
            const price = product.sale_price ?? product.price;
            const nameLower = product.name.toLowerCase();

            return (
                (!categories.length || categories.includes(product.category)) &&
                (!brands.length || brands.includes(product.brand)) &&
                price >= priceRange[0] &&
                price <= priceRange[1] &&
                (!termLower || nameLower.includes(termLower))
            );
        });
    }, []);

    const applyFilters = () => {
        updateURL(filters);
        const baseList = getFilteredProducts(filters, products);
        let sorted = [...baseList];
        if (filters.sortBy === "price-asc") {
            sorted.sort((a, b) => (a.sale_price ?? a.price) - (b.sale_price ?? b.price));
        } else if (filters.sortBy === "price-desc") {
            sorted.sort((a, b) => (b.sale_price ?? b.price) - (a.sale_price ?? a.price));
        } else if (filters.sortBy === "rating-desc") {
            sorted.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
        }
        setFilteredProducts(sorted);
    };

    const handleSortChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
        const value = event.target.value as Filters["sortBy"];
        setFilters((prev) => ({ ...prev, sortBy: value }));
    }, []);

    const handleResetFilters = useCallback(() => {
        const reset: Filters = {
            term: "",
            categories: [],
            brands: [],
            priceRange: [0, MAX_PRICE_RANGE],
            sortBy: "relevance",
        };
        setFilters(reset);
        updateURL(reset);
        setFilteredProducts(products);
    }, [products, updateURL]);

    useEffect(() => {
        const queryParams = new URLSearchParams(location.search);
        const newFilters: Filters = {
            term: queryParams.get("term") ?? "",
            categories:
                queryParams
                    .get("categories")
                    ?.split(",")
                    .filter((category) => category !== "") ?? [],
            brands:
                queryParams
                    .get("brands")
                    ?.split(",")
                    .filter((brand) => brand !== "") ?? [],
            priceRange: [
                Number(queryParams.get("minPrice") ?? 0),
                Number(queryParams.get("maxPrice") ?? MAX_PRICE_RANGE),
            ],
            sortBy: (queryParams.get("sortBy") as Filters["sortBy"]) ?? "relevance",
        };
        setFilters(newFilters);
        return () => {};
    }, [location.search]);

    useEffect(() => {
        const fetchProducts = async () => {
            setIsLoading(true); // Set loading state to indicate data fetching
            try {
                const response = await axios.get("/api/products");
                if (response.status === 200) {
                    setProducts(response.data.products);
                    setFilteredProducts(response.data.products);
                    console.log(response.data.msg);
                }
            } catch (err) {
                console.error(err);
            } finally {
                setIsLoading(false);
            }
        };
        fetchProducts();
        return () => {};
    }, []);

    useEffect(() => {
        const fetchWishlist = async () => {
            try {
                if (uid) {
                    const response = await axios.get(`/api/wishlist/${uid}`);
                    if (response.status === 200) {
                        const newWishlist: Wishlist[] = response.data.wishlist.map((item: any) => {
                            const { id, product_id, ...productProps } = item;
                            return {
                                id,
                                product: {
                                    id: product_id,
                                    ...productProps,
                                },
                            };
                        });

                        setWishlist(newWishlist);
                        console.log(response.data.msg);
                    }
                }
            } catch (err) {
                console.error(err);
            }
        };
        fetchWishlist();
    }, [uid]);

    return (
        <Layout>
            <Helmet>
                <title>Shop Products | Digital-E</title>
                <meta
                    name="description"
                    content="Browse the full catalog of electronics, filter by brand, category, and price, and find your next upgrade."
                />
            </Helmet>
            <main className="shops">
                <h2 className="shops__title">Shops Products</h2>
                <div className="shops__topbar">
                    <div className="shops__topbar__search">
                        <input
                            type="text"
                            placeholder="Search products, brands, categories..."
                            value={filters.term}
                            onChange={handleTermChange}
                            onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                    applyFilters();
                                }
                            }}
                        />
                    </div>
                    <div className="shops__topbar__meta">
                        <span>{filteredProducts.length} results</span>
                    </div>
                    <div className="shops__topbar__controls">
                        <select value={filters.sortBy} onChange={handleSortChange}>
                            <option value="relevance">Sort: Relevance</option>
                            <option value="price-asc">Price: Low to High</option>
                            <option value="price-desc">Price: High to Low</option>
                            <option value="rating-desc">Rating: High to Low</option>
                        </select>
                        <button type="button" className="shops__topbar__apply" onClick={applyFilters}>
                            Apply
                        </button>
                        <button type="button" className="shops__topbar__reset" onClick={handleResetFilters}>
                            Clear
                        </button>
                    </div>
                </div>
                <div className="shops__container">
                    <AsideShops
                        products={products}
                        filters={filters}
                        onCheckboxChange={handleCheckboxChange}
                        onPriceRangeChange={handlePriceRangeChange}
                        onApplyFilters={applyFilters}
                    />
                    <section data-testid="shops__container" className="shops__container__main">
                        {isLoading ? (
                            <p>Loading products...</p>
                        ) : (
                            <PaginatedItems
                                itemsPerPage={ITEMS_PER_PAGE}
                                items={filteredProducts}
                                uid={uid}
                                wishlist={wishlist}
                                isWishlistPage={false}
                            />
                        )}
                    </section>
                </div>
            </main>
        </Layout>
    );
};
export default ShopsPage;
