import queryString from "query-string";
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Cookies from "universal-cookie";
import axios from "../../api/axios";
import "../../styles/ShopsPage.scss";
import { Product } from "../../utils/interface";
import AsideShops from "../common/AsideShops";
import NavigationBar from "../common/NavigationBar";
import PaginatedItems from "../common/PaginatedItems";
import Layout from "../layout/Layout";
import ErrorPage from "./ErrorPage";

const cookies = new Cookies();

const ITEMS_PER_PAGE = 6;

interface Wishlist {
    id: number;
    product: Product;
}

type Filters = {
    categories: string[];
    brands: string[];
    priceRange: [number, number];
};

const ShopsPage = () => {
    const [products, setProducts] = useState<Product[]>([]);
    const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [wishlist, setWishlist] = useState<Wishlist[]>([]);
    const [filters, setFilters] = useState<Filters>({
        categories: [],
        brands: [],
        priceRange: [0, 5000],
    });

    const navigate = useNavigate();
    const location = useLocation();
    const uid =
        cookies.get("rememberMe")?.uid ||
        (sessionStorage["rememberMe"]
            ? JSON.parse(sessionStorage["rememberMe"]).uid
            : "");

    const updateURL = (newFilters: Filters) => {
        const queryParams = {
            categories: newFilters.categories.join(","),
            brands: newFilters.brands.join(","),
            minPrice: newFilters.priceRange[0],
            maxPrice: newFilters.priceRange[1],
        };
        const newQueryString = queryString.stringify(queryParams);
        navigate(`${location.pathname}?${newQueryString}`);
    };

    const handleCheckboxChange = (
        type: "categories" | "brands",
        value: string
    ) => {
        setFilters((prevFilters) => {
            const updatedArray = prevFilters[type].includes(value)
                ? prevFilters[type].filter((item) => item !== value) // Uncheck checkbox
                : [...prevFilters[type], value]; // Check checkbox

            return {
                ...prevFilters,
                [type]: updatedArray,
            };
        });
    };

    const handlePriceRangeChange = (newValue: [number, number]) => {
        setFilters((prevFilters) => ({
            ...prevFilters,
            priceRange: newValue,
        }));
    };

    const applyFilters = () => {
        updateURL(filters);
        setFilteredProducts(getFilteredProducts(filters, products));
    };

    const getFilteredProducts = (
        filters: Filters,
        allProducts: Product[]
    ): Product[] => {
        const { categories, brands, priceRange } = filters;

        return allProducts.filter((product) => {
            // Kiểm tra filter categories
            const matchCategory =
                categories.length === 0 ||
                categories.includes(product.category);

            // Kiểm tra filter brands
            const matchBrand =
                brands.length === 0 || brands.includes(product.brand);

            // Kiểm tra filter priceRange
            const matchPrice =
                product.price >= priceRange[0] &&
                product.price <= priceRange[1];

            // Trả về sản phẩm nếu thoả mãn tất cả các điều kiện
            return matchCategory && matchBrand && matchPrice;
        });
    };

    useEffect(() => {
        const queryParams = queryString.parse(location.search);
        const newFilters: Filters = {
            categories: queryParams.categories
                ? (queryParams.categories as string).split(",")
                : [],
            brands: queryParams.brands
                ? (queryParams.brands as string).split(",")
                : [],
            priceRange: [
                queryParams.minPrice ? Number(queryParams.minPrice) : 0,
                queryParams.maxPrice ? Number(queryParams.maxPrice) : 5000,
            ],
        };
        setFilters(newFilters);
    }, [location.search]);

    useEffect(() => {
        const fetchProducts = async () => {
            setIsLoading(true); // Set loading state to indicate data fetching
            setError(null); // Clear any previous errors
            try {
                const response = await axios.get("/api/products");
                if (response.status === 200) {
                    setProducts(response.data.products);
                    setFilteredProducts(response.data.products);
                    console.log(response.data.msg);
                }
            } catch (err: any) {
                setError(err);
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
                const response = await axios.get(`/api/wishlist/${uid}`);
                if (response.status === 200) {
                    const newWishlist: Wishlist[] = response.data.wishlist.map(
                        (item: any) => {
                            const { id, product_id, ...productProps } = item;
                            return {
                                id,
                                product: {
                                    id: product_id,
                                    ...productProps,
                                },
                            };
                        }
                    );

                    setWishlist(newWishlist);
                    console.log(response.data.msg);
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
            <div className="shops">
                <h2 style={{ marginBottom: "2rem", fontWeight: "bold" }}>
                    SHOPS PRODUCTS
                </h2>
                <div className="shops__container">
                    <AsideShops
                        products={products}
                        filters={filters}
                        onCheckboxChange={handleCheckboxChange}
                        onPriceRangeChange={handlePriceRangeChange}
                        onApplyFilters={applyFilters}
                    />
                    <div className="shops__container__main">
                        {isLoading && <p>Loading products...</p>}
                        {error && <ErrorPage error={error} />}
                        <PaginatedItems
                            itemsPerPage={ITEMS_PER_PAGE}
                            items={filteredProducts}
                            uid={uid}
                            wishlist={wishlist}
                        />
                    </div>
                </div>
            </div>
        </Layout>
    );
};

export default ShopsPage;
