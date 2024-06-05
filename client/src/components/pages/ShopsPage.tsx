import { useEffect, useState } from "react";
import Cookies from "universal-cookie";
import axios from "../../api/axios";
import "../../styles/ShopsPage.scss";
import { Product } from "../../utils/interface";
import AsideShops from "../common/AsideShops";
import PaginatedItems from "../common/PaginatedItems";
import Layout from "../layout/Layout";
import ErrorPage from "./ErrorPage";
import NavigationBar from "../common/NavigationBar";

const cookies = new Cookies();

const ShopsPage = () => {
    const [products, setProducts] = useState<Product[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [wishlist, setWishlist] = useState<Product[]>([]);
    const uid =
        cookies.get("rememberMe")?.uid ||
        (sessionStorage["rememberMe"]
            ? JSON.parse(sessionStorage["rememberMe"]).uid
            : "");
    useEffect(() => {
        const fetchProducts = async () => {
            setIsLoading(true); // Set loading state to indicate data fetching
            setError(null); // Clear any previous errors
            try {
                const response = await axios.get("/api/products");
                if (response.status === 200) {
                    setProducts(response.data.products);
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
                    setWishlist(response.data.wishlist);

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
                    <AsideShops products={products} />
                    <div className="shops__container__main">
                        {isLoading && <p>Loading products...</p>}
                        {error && <ErrorPage error={error} />}
                        <PaginatedItems
                            itemsPerPage={6}
                            items={products}
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
