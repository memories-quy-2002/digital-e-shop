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
import { useToast } from "../../context/ToastContext";

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
    const { addToast } = useToast();
    const searchInputId = "shops-search";
    const sortSelectId = "shops-sort";
    const resultsHeadingId = "shops-results-heading";

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

    const getVisibleProducts = useCallback((activeFilters: Filters, allProducts: Product[]): Product[] => {
        const { priceRange } = activeFilters;
        const termLower = activeFilters.term.trim().toLowerCase();

        const filtered = allProducts.filter((product) => {
            const price = product.sale_price ?? product.price;
            const haystack = `${product.name} ${product.brand} ${product.category}`.toLowerCase();

            return (
                (!activeFilters.categories.length || activeFilters.categories.includes(product.category)) &&
                (!activeFilters.brands.length || activeFilters.brands.includes(product.brand)) &&
                price >= priceRange[0] &&
                price <= priceRange[1] &&
                (!termLower || haystack.includes(termLower))
            );
        });

        if (activeFilters.sortBy === "price-asc") {
            return [...filtered].sort((a, b) => (a.sale_price ?? a.price) - (b.sale_price ?? b.price));
        }

        if (activeFilters.sortBy === "price-desc") {
            return [...filtered].sort((a, b) => (b.sale_price ?? b.price) - (a.sale_price ?? a.price));
        }

        if (activeFilters.sortBy === "rating-desc") {
            return [...filtered].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
        }

        return filtered;
    }, []);

    const applyFilters = useCallback(() => {
        updateURL(filters);
        setFilteredProducts(getVisibleProducts(filters, products));
    }, [filters, getVisibleProducts, products, updateURL]);

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
        setFilteredProducts(getVisibleProducts(reset, products));
    }, [getVisibleProducts, products, updateURL]);

    useEffect(() => {
        // Keep the UI state in sync with sharable filter query params.
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
            setIsLoading(true);
            try {
                const response = await axios.get("/api/products");
                if (response.status === 200) {
                    const catalog: Product[] = response.data.products || [];
                    setProducts(catalog);
                }
            } catch (err) {
                addToast("Products", "Unable to load products right now.");
            } finally {
                setIsLoading(false);
            }
        };
        fetchProducts();
        return () => {};
    }, [addToast]);

    useEffect(() => {
        setFilteredProducts(getVisibleProducts(filters, products));
    }, [filters, getVisibleProducts, products]);

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
                    }
                }
            } catch (err) {
                if (uid) {
                    addToast("Wishlist", "Unable to load wishlist.");
                }
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
                <header className="shops__header">
                    <div>
                        <span className="shops__header__eyebrow">Shop Digital-E</span>
                        <h1>Browse curated electronics for every workspace</h1>
                        <p>Filter by category, brand, and price to find your next upgrade.</p>
                    </div>
                    <div className="shops__header__summary">
                        <div>
                            <strong>{filteredProducts.length}</strong>
                            <span>Results</span>
                        </div>
                        <div>
                            <strong>{products.length}</strong>
                            <span>Total products</span>
                        </div>
                    </div>
                </header>

                <div className="shops__toolbar" aria-label="Shop filters and search controls">
                    <div className="shops__toolbar__search" role="search">
                        <label className="shops__sr-only" htmlFor={searchInputId}>
                            Search products, brands, or categories
                        </label>
                        <input
                            type="text"
                            id={searchInputId}
                            placeholder="Search products, brands, categories..."
                            value={filters.term}
                            onChange={handleTermChange}
                            onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                    applyFilters();
                                }
                            }}
                        />
                        <button type="button" onClick={applyFilters}>
                            Search
                        </button>
                    </div>
                    <div className="shops__toolbar__controls">
                        <label className="shops__sr-only" htmlFor={sortSelectId}>
                            Sort product results
                        </label>
                        <select
                            id={sortSelectId}
                            value={filters.sortBy}
                            onChange={handleSortChange}
                            aria-label="Sort product results"
                        >
                            <option value="relevance">Sort: Relevance</option>
                            <option value="price-asc">Price: Low to High</option>
                            <option value="price-desc">Price: High to Low</option>
                            <option value="rating-desc">Rating: High to Low</option>
                        </select>
                        <button type="button" className="primary" onClick={applyFilters}>
                            Apply filters
                        </button>
                        <button type="button" className="ghost" onClick={handleResetFilters}>
                            Reset
                        </button>
                    </div>
                </div>

                <div className="shops__layout">
                    <aside className="shops__layout__aside">
                        <AsideShops
                            products={products}
                            filters={filters}
                            onCheckboxChange={handleCheckboxChange}
                            onPriceRangeChange={handlePriceRangeChange}
                            onApplyFilters={applyFilters}
                        />
                    </aside>
                    <section
                        data-testid="shops__container"
                        className="shops__layout__main"
                        aria-labelledby={resultsHeadingId}
                    >
                        <h2 id={resultsHeadingId} className="shops__sr-only">
                            Product results
                        </h2>
                        {isLoading ? (
                            <div className="shops__layout__loading" aria-live="polite">
                                Loading products...
                            </div>
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
