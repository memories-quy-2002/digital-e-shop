import { useContext, useEffect, useState } from "react";
import { Toast, ToastContainer } from "react-bootstrap";
import { IoArrowForward } from "react-icons/io5";
import { useNavigate } from "react-router-dom";
import Cookies from "universal-cookie";
import axios from "../../api/axios";
import iphone from "../../assets/images/iphone.jpg";
import { UserContext } from "../../context/UserDataProvider";
import "../../styles/HomePage.scss";
import { Product } from "../../utils/interface";
import recommendations from "../../utils/recommendations.json";
import NavigationBar from "../common/NavigationBar";
import ProductItem from "../common/ProductItem";
import Layout from "../layout/Layout";

const cookies = new Cookies();

interface Wishlist {
    id: number;
    product: Product;
}

const HomePage = () => {
    const navigate = useNavigate();
    const [products, setProducts] = useState<Product[]>([]);
    const [wishlist, setWishlist] = useState<Wishlist[]>([]);
    const [show, setShow] = useState<boolean>(false);
    const [msg, setMsg] = useState<string>("");
    const [userRecommendations, setUserRecommendations] = useState<number[]>(
        []
    );
    const toggleShow = () => setShow(!show);
    const uid =
        cookies.get("rememberMe")?.uid ||
        (sessionStorage["rememberMe"]
            ? JSON.parse(sessionStorage["rememberMe"]).uid
            : "");
    const { userData, loading, fetchUserData } = useContext(UserContext);

    const onAddingWishlist = async (user_id: string, product_id: number) => {
        if (uid === "") {
            navigate("/login");
        }
        try {
            const response = await axios.post("/api/wishlist/", {
                uid: user_id,
                pid: product_id,
            });
            if (response.status === 200) {
                console.log(response.data.msg);
                setShow(!show);
                setMsg("You added a product to wishlist successfully");
            }
            console.log(show);
        } catch (err) {
            throw err;
        }
    };
    const onAddingCart = async (user_id: string, product_id: number) => {
        if (uid === "") {
            navigate("/login");
        }
        try {
            const response = await axios.post("/api/cart/", {
                uid: user_id,
                pid: product_id,
                quantity: 1,
            });
            if (response.status === 200) {
                console.log(response.data.msg);
                setShow(!show);
                setMsg("You added a product to your cart successfully");
            }
        } catch (err) {
            throw err;
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
                            <a
                                href="/shops"
                                target="blank"
                                style={{
                                    textDecoration: "none",
                                    fontSize: "20px",
                                }}
                            >
                                View all <IoArrowForward />
                            </a>
                        </div>
                    </div>
                    <div className="home__product__menu">
                        {products
                            .filter((product) =>
                                userRecommendations.includes(product.id)
                            )
                            .map((product) => (
                                <ProductItem
                                    key={product.id}
                                    product={product}
                                    uid={uid}
                                    isWishlist={wishlist.some(
                                        (item) => item.product.id === product.id
                                    )}
                                    onAddingWishlist={() =>
                                        onAddingWishlist(uid, product.id)
                                    }
                                    onAddingCart={() =>
                                        onAddingCart(uid, product.id)
                                    }
                                />
                            ))}
                    </div>
                </div>

                <ToastContainer
                    className="p-3"
                    position="bottom-end"
                    style={{
                        zIndex: 1,
                        position: "fixed",
                        bottom: 0,
                        right: 0,
                    }}
                >
                    <Toast
                        show={show}
                        onClose={toggleShow}
                        delay={3000}
                        autohide
                    >
                        <Toast.Header>
                            <strong className="me-auto">DIGITAL-E</strong>
                            <small>Just now</small>
                        </Toast.Header>
                        <Toast.Body>{msg}</Toast.Body>
                    </Toast>
                </ToastContainer>
            </div>
        </Layout>
    );
};

export default HomePage;
