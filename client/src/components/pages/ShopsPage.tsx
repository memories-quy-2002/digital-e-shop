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

const cookies = new Cookies();
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
        priceRange: [0, 4000],
    });

    const navigate = useNavigate();
    const location = useLocation();
    const uid =
        cookies.get("rememberMe")?.uid ||
        (sessionStorage["rememberMe"]
            ? JSON.parse(sessionStorage["rememberMe"]).uid
            : "");

    const updateURL = (newFilters: Filters) => {
        const queryParams = new URLSearchParams({
            categories: newFilters.categories.join(","),
            brands: newFilters.brands.join(","),
            minPrice: newFilters.priceRange[0].toString(),
            maxPrice: newFilters.priceRange[1].toString(),
            term: newFilters.term,
        });
        navigate(`${location.pathname}?${queryParams.toString()}`);
    };

    const handleTermChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFilters((prevFilters) => {
            return {
                ...prevFilters,
                term: e.target.value.trim(),
            };
        });
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

    const getFilteredProducts = (
        filters: Filters,
        allProducts: Product[]
    ): Product[] => {
        const { term, categories, brands, priceRange } = filters;

        return allProducts.filter((product) => {
            const matchCategory =
                categories.length === 0 ||
                categories.includes(product.category);

            const matchBrand =
                brands.length === 0 || brands.includes(product.brand);

            const matchPrice =
                product.price >= priceRange[0] &&
                product.price <= priceRange[1];

            const matchTerm =
                term.trim().toLowerCase() === ""
                    ? true
                    : product.name
                          .toLowerCase()
                          .includes(term.trim().toLowerCase());

            // Trả về sản phẩm nếu thoả mãn tất cả các điều kiện
            return matchCategory && matchBrand && matchPrice && matchTerm;
        });
    };

    const applyFilters = () => {
        updateURL(filters);
        setFilteredProducts(getFilteredProducts(filters, products));
    };

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
                Number(queryParams.get("maxPrice") ?? 4000),
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
            } catch (err: any) {
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
                        const newWishlist: Wishlist[] =
                            response.data.wishlist.map((item: any) => {
                                const { id, product_id, ...productProps } =
                                    item;
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
                        onTermChange={handleTermChange}
                    />
                    <div
                        data-testid="shops__container"
                        className="shops__container__main"
                    >
                        {isLoading && <p>Loading products...</p>}
                        <PaginatedItems
                            itemsPerPage={ITEMS_PER_PAGE}
                            items={filteredProducts}
                            uid={uid}
                            wishlist={wishlist}
                            isWishlistPage={false}
                        />
                    </div>
                </div>
            </div>
        </Layout>
    );
};
export default ShopsPage;
