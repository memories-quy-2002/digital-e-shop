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
    const [currentPage, setCurrentPage] = useState(1);
    const [totalProducts, setTotalProducts] = useState(0);
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
            setIsLoading(true);
            try {
                const response = await axios.get(`/api/products?page=${currentPage}&limit=${ITEMS_PER_PAGE}`);
                if (response.status === 200) {
                    setProducts(response.data.products);
                    setFilteredProducts(response.data.products);
                    if (response.data.pagination) {
                        setTotalProducts(response.data.pagination.total || 0);
                    } else {
                        setTotalProducts(response.data.products.length);
                    }
                }
            } catch (err) {
                addToast("Products", "Unable to load products right now.");
            } finally {
                setIsLoading(false);
            }
        };
        fetchProducts();
        return () => {};
    }, [currentPage]);

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
                            <strong>{totalProducts || products.length}</strong>
                            <span>Total products</span>
                        </div>
                    </div>
                </header>

                <div className="shops__toolbar">
                    <div className="shops__toolbar__search">
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
                        <button type="button" onClick={applyFilters}>
                            Search
                        </button>
                    </div>
                    <div className="shops__toolbar__controls">
                        <select value={filters.sortBy} onChange={handleSortChange}>
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
                    <section data-testid="shops__container" className="shops__layout__main">
                        {isLoading ? (
                            <div className="shops__layout__loading">Loading products...</div>
                        ) : (
                            <PaginatedItems
                                itemsPerPage={ITEMS_PER_PAGE}
                                items={filteredProducts}
                                uid={uid}
                                wishlist={wishlist}
                                isWishlistPage={false}
                                serverSide
                                totalItems={totalProducts}
                                currentPage={currentPage}
                                onPageChange={setCurrentPage}
                            />
                        )}
                    </section>
                </div>
            </main>
        </Layout>
    );
};
export default ShopsPage;
