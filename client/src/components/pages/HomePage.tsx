import { useContext, useEffect, useState } from "react";
import { IoArrowForward } from "react-icons/io5";
import { Link, useNavigate } from "react-router-dom";
import Cookies from "universal-cookie";
import axios from "../../api/axios";
import iphone from "../../assets/images/iphone.jpg";
import { useToast } from "../../context/ToastContext";
import { UserContext } from "../../context/UserDataContext";
import "../../styles/HomePage.scss";
import { Product } from "../../utils/interface";
import recommendations from "../../utils/recommendations.json";
import NavigationBar from "../common/NavigationBar";
import ProductItem from "../common/ProductItem";
import Layout from "../layout/Layout";

const cookies = new Cookies();
const DISPLAYED_NUMBER = 12;
interface Wishlist {
    id: number;
    product: Product;
}

const HomePage = () => {
    const navigate = useNavigate();
    const [products, setProducts] = useState<Product[]>([]);
    const [wishlist, setWishlist] = useState<Wishlist[]>([]);
    const [userRecommendations, setUserRecommendations] = useState<number[]>(
        []
    );
    const uid =
        cookies.get("rememberMe")?.uid ||
        (sessionStorage["rememberMe"]
            ? JSON.parse(sessionStorage["rememberMe"]).uid
            : "");
    const { userData, loading, fetchUserData } = useContext(UserContext);
    const { addToast } = useToast();

    const handleAddingWishlist = async (
        user_id: string,
        product_id: number
    ) => {
        if (uid === "") {
            addToast(
                "Login required",
                "You need to login to use this feature."
            );
            return;
        }
        try {
            if (wishlist.some((item) => item.product.id === product_id)) {
                const response = await axios.post(`/api/wishlist/delete/`, {
                    uid: user_id,
                    pid: product_id,
                });
                if (response.status === 200) {
                    console.log(response.data.msg);
                    setWishlist((list) =>
                        list.filter((item) => item.product.id !== product_id)
                    );
                    addToast(
                        "Remove wishlist item",
                        "Item removed from wishlist successfully"
                    );
                }
            } else {
                const response = await axios.post("/api/wishlist/", {
                    uid: user_id,
                    pid: product_id,
                });
                if (response.status === 200) {
                    console.log(response.data.msg);
                    const newProduct = products.filter(
                        (product) => product.id === product_id
                    )[0];
                    setWishlist((list) => [
                        ...list,
                        {
                            id: product_id,
                            product: newProduct,
                        },
                    ]);
                    addToast(
                        "Add wishlist item",
                        "Item added to wishlist successfully"
                    );
                }
            }
        } catch (err) {
            console.error(err);
        }
    };
    const handleAddingCart = async (user_id: string, product_id: number) => {
        if (uid === "") {
            addToast(
                "Login required",
                "You need to login to use this feature."
            );
            return;
        }
        try {
            const response = await axios.post("/api/cart/", {
                uid: user_id,
                pid: product_id,
                quantity: 1,
            });
            if (response.status === 200) {
                console.log(response.data.msg);
                addToast("Add cart item", "Product added to cart successfully");
            }
        } catch (err) {
            console.error(err);
        }
    };
    useEffect(() => {
        fetchUserData(uid);
        return () => {};
    }, [uid]);

    useEffect(() => {
        const fetchProducts = async () => {
            try {
                const response = await axios.get("/api/products");
                if (response.status === 200) {
                    setProducts(response.data.products);

                    console.log(response.data.msg);
                }
            } catch (err) {
                console.error(err);
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
        return () => {};
    }, [uid]);

    useEffect(() => {
        const getProductIdsByUserId = (userId: string): number[] => {
            const userProductData = recommendations.find(
                (user) => user.user_id === userId
            );
            return userProductData ? userProductData.products : [];
        };
        if (userData && !loading) {
            setUserRecommendations(getProductIdsByUserId(userData.id));
        }
        return () => {};
    }, [userData, loading]);
    return (
        <Layout>
            <NavigationBar />
            <div className="home">
                <div className="home__hero">
                    <div className="home__hero__overlap">
                        <p className="home__hero__overlap__upto">
                            <span className="home__hero__overlap__upto__wrapper">
                                Up to 55% OFF
                                <br />
                            </span>
                            <span
                                className="home__hero__overlap__upto__wrapper"
                                style={{ fontSize: "28px" }}
                            >
                                with the new devices
                            </span>
                        </p>
                        <button
                            type="button"
                            className="home__hero__overlap__button"
                            onClick={() => navigate("/")}
                        >
                            BUY NOW <IoArrowForward />
                        </button>
                    </div>
                    <img
                        className="home__hero__overlap__iphone"
                        alt="Iphone"
                        src={iphone}
                    />
                </div>

                <div className="home__product">
                    <div className="home__product__header">
                        <h3 className="home__product__header__title">
                            All products
                        </h3>
                        <div>
                            <Link
                                to="/shops"
                                style={{
                                    textDecoration: "none",
                                    fontSize: "20px",
                                }}
                            >
                                View all <IoArrowForward />
                            </Link>
                        </div>
                    </div>
                    <div className="home__product__menu">
                        {products
                            .filter((product) => {
                                if (uid && userRecommendations.length > 0) {
                                    return (
                                        userRecommendations.includes(
                                            product.id
                                        ) && product.stock > 0
                                    );
                                } else return product.stock > 0;
                            })
                            .slice(0, DISPLAYED_NUMBER)
                            .map((product) => (
                                <ProductItem
                                    key={product.id}
                                    product={product}
                                    uid={uid}
                                    isWishlist={wishlist.some(
                                        (item) => item.product.id === product.id
                                    )}
                                    onAddingWishlist={() =>
                                        handleAddingWishlist(uid, product.id)
                                    }
                                    onAddingCart={() =>
                                        handleAddingCart(uid, product.id)
                                    }
                                />
                            ))}
                    </div>
                </div>
            </div>
        </Layout>
    );
};

export default HomePage;
