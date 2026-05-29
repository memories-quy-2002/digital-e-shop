import { useCallback, useEffect, useState, useTransition } from "react";
import { Helmet } from "react-helmet";
import { useLocation, useNavigate } from "react-router-dom";
import axios from "../api/axios";
import AsideShops from "../components/common/AsideShops";
import PaginatedItems from "../components/common/PaginatedItems";
import Layout from "../components/layout/Layout";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import "../styles/ShopsPage.scss";
import { Product } from "../utils/interface";

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

type ProductFacets = {
    categories: string[];
    brands: string[];
    minPrice: number;
    maxPrice: number;
    totalProducts: number;
};

const ShopsPage = () => {
    const [products, setProducts] = useState<Product[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [wishlist, setWishlist] = useState<Wishlist[]>([]);
    const [facets, setFacets] = useState<ProductFacets>({
        categories: [],
        brands: [],
        minPrice: 0,
        maxPrice: MAX_PRICE_RANGE,
        totalProducts: 0,
    });
    const [pagination, setPagination] = useState({
        page: 1,
        limit: ITEMS_PER_PAGE,
        total: 0,
        totalPages: 1,
    });
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
    const loadingCardCount = ITEMS_PER_PAGE;
    const [isUpdatingFilters, startFilterTransition] = useTransition();

    const updateURL = useCallback(
        (newFilters: Filters, nextPage = 1) => {
            const queryParams = new URLSearchParams({
                categories: newFilters.categories.join(","),
                brands: newFilters.brands.join(","),
                minPrice: newFilters.priceRange[0].toString(),
                maxPrice: newFilters.priceRange[1].toString(),
                term: newFilters.term.trim(),
                sortBy: newFilters.sortBy,
                page: String(nextPage),
            });
            navigate(`${location.pathname}?${queryParams.toString()}`, { replace: true });
        },
        [navigate, location.pathname],
    );

    const handleTermChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        setFilters((prev) => ({ ...prev, term: e.target.value }));
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

    const applyFilters = useCallback(() => {
        startFilterTransition(() => {
            updateURL(filters, 1);
        });
    }, [filters, updateURL]);

    const handleSortChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
        const value = event.target.value as Filters["sortBy"];
        setFilters((prev) => ({ ...prev, sortBy: value }));
    }, []);

    const handleResetFilters = useCallback(() => {
        const reset: Filters = {
            term: "",
            categories: [],
            brands: [],
            priceRange: [facets.minPrice, facets.maxPrice || MAX_PRICE_RANGE],
            sortBy: "relevance",
        };
        setFilters(reset);
        startFilterTransition(() => {
            updateURL(reset, 1);
        });
    }, [facets.maxPrice, facets.minPrice, updateURL]);

    useEffect(() => {
        const queryParams = new URLSearchParams(location.search);
        const nextMinPrice = Number(queryParams.get("minPrice"));
        const nextMaxPrice = Number(queryParams.get("maxPrice"));
        const newFilters: Filters = {
            term: queryParams.get("term") ?? "",
            categories: queryParams.get("categories")?.split(",").filter((category) => category !== "") ?? [],
            brands: queryParams.get("brands")?.split(",").filter((brand) => brand !== "") ?? [],
            priceRange: [
                Number.isFinite(nextMinPrice) ? nextMinPrice : 0,
                Number.isFinite(nextMaxPrice) ? nextMaxPrice : MAX_PRICE_RANGE,
            ],
            sortBy: (queryParams.get("sortBy") as Filters["sortBy"]) ?? "relevance",
        };
        setFilters(newFilters);
    }, [location.search]);

    useEffect(() => {
        const fetchFacets = async () => {
            try {
                const response = await axios.get("/api/products/facets");
                if (response.status === 200) {
                    const nextFacets = response.data.facets as ProductFacets;
                    setFacets(nextFacets);
                    setFilters((current) => {
                        if (current.priceRange[0] !== 0 || current.priceRange[1] !== MAX_PRICE_RANGE) {
                            return current;
                        }

                        return {
                            ...current,
                            priceRange: [nextFacets.minPrice, nextFacets.maxPrice || MAX_PRICE_RANGE],
                        };
                    });
                }
            } catch {
                addToast("Products", "Unable to load filter options.");
            }
        };
        fetchFacets();
    }, [addToast]);

    useEffect(() => {
        const queryParams = new URLSearchParams(location.search);
        const activePage = Math.max(1, Number(queryParams.get("page")) || 1);
        const requestParams = new URLSearchParams({
            page: String(activePage),
            limit: String(ITEMS_PER_PAGE),
            sortBy: filters.sortBy,
        });

        if (filters.term.trim()) {
            requestParams.set("term", filters.term.trim());
        }
        if (filters.categories.length > 0) {
            requestParams.set("categories", filters.categories.join(","));
        }
        if (filters.brands.length > 0) {
            requestParams.set("brands", filters.brands.join(","));
        }
        requestParams.set("minPrice", String(filters.priceRange[0]));
        requestParams.set("maxPrice", String(filters.priceRange[1]));

        const fetchProducts = async () => {
            setIsLoading(true);
            try {
                const response = await axios.get(`/api/products?${requestParams.toString()}`);
                if (response.status === 200) {
                    setProducts(response.data.products || []);
                    setPagination(
                        response.data.pagination || {
                            page: activePage,
                            limit: ITEMS_PER_PAGE,
                            total: response.data.products?.length || 0,
                            totalPages: 1,
                        },
                    );
                }
            } catch {
                addToast("Products", "Unable to load products right now.");
                setProducts([]);
            } finally {
                setIsLoading(false);
            }
        };

        fetchProducts();
    }, [addToast, filters, location.search]);

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
            } catch {
                if (uid) {
                    addToast("Wishlist", "Unable to load wishlist.");
                }
            }
        };
        fetchWishlist();
    }, [addToast, uid]);

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
                            <strong>{isLoading ? "..." : pagination.total}</strong>
                            <span>Results</span>
                        </div>
                        <div>
                            <strong>{isLoading ? "..." : facets.totalProducts}</strong>
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
                        <button type="button" className="primary" onClick={applyFilters} disabled={isUpdatingFilters}>
                            {isUpdatingFilters ? "Applying..." : "Apply filters"}
                        </button>
                        <button type="button" className="ghost" onClick={handleResetFilters} disabled={isUpdatingFilters}>
                            Reset
                        </button>
                    </div>
                </div>

                <div className="shops__layout">
                    <aside className="shops__sidebar">
                        <AsideShops
                            products={products}
                            categories={facets.categories}
                            brands={facets.brands}
                            filters={filters}
                            onCheckboxChange={handleCheckboxChange}
                            onPriceRangeChange={handlePriceRangeChange}
                            onApplyFilters={applyFilters}
                        />
                    </aside>
                    <section data-testid="shops__container" className="shops__content" aria-labelledby={resultsHeadingId}>
                        <h2 id={resultsHeadingId} className="shops__sr-only">
                            Product results
                        </h2>
                        {isLoading ? (
                            <div className="shops__loading" aria-live="polite">
                                <div className="shops__loading-grid" aria-hidden="true">
                                    {Array.from({ length: loadingCardCount }, (_, index) => (
                                        <div key={`shops-loading-${index}`} className="shops__loading-card">
                                            <div className="shops__skeleton shops__skeleton--image" />
                                            <div className="shops__skeleton shops__skeleton--line shops__skeleton--xs" />
                                            <div className="shops__skeleton shops__skeleton--line shops__skeleton--lg" />
                                            <div className="shops__skeleton shops__skeleton--line shops__skeleton--sm" />
                                            <div className="shops__loading-card-footer">
                                                <div className="shops__skeleton shops__skeleton--line shops__skeleton--sm" />
                                                <div className="shops__skeleton shops__skeleton--pill" />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <PaginatedItems
                                itemsPerPage={ITEMS_PER_PAGE}
                                items={products}
                                uid={uid}
                                wishlist={wishlist}
                                isWishlistPage={false}
                                serverSide
                                totalItems={pagination.total}
                                currentPage={pagination.page}
                                onPageChange={(page) => updateURL(filters, page)}
                            />
                        )}
                    </section>
                </div>
            </main>
        </Layout>
    );
};

export default ShopsPage;
