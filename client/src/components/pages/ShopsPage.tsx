import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Cookies from "universal-cookie";
import axios from "../../api/axios";
import "../../styles/ShopsPage.scss";
import { Product } from "../../utils/interface";
import AsideShops from "../common/AsideShops";
import NavigationBar from "../common/NavigationBar";
import PaginatedItems from "../common/PaginatedItems";
import Layout from "../layout/Layout";
import { Helmet } from "react-helmet";
import { useAuth } from "../../context/AuthContext";

const cookies = new Cookies();
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
            });
            navigate(`${location.pathname}?${queryParams.toString()}`, { replace: true });
        },
        [navigate, location.pathname]
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
        setFilteredProducts(getFilteredProducts(filters, products));
    };

    useEffect(() => {
        console.log(cookies, sessionStorage);
    });

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
            <NavigationBar />
            <Helmet>
                <title>Shops</title>
                <meta name="description" content="Explore a wide range of products from various shops." />
            </Helmet>
            <main className="shops">
                <h2 className="shops__title">Shops Products</h2>
                <div className="shops__container">
                    <AsideShops
                        products={products}
                        filters={filters}
                        onCheckboxChange={handleCheckboxChange}
                        onPriceRangeChange={handlePriceRangeChange}
                        onApplyFilters={applyFilters}
                        onTermChange={handleTermChange}
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
