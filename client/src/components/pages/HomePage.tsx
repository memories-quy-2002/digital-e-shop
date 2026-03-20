import React, { useEffect, useState, useMemo } from "react";
import { IoArrowForward } from "react-icons/io5";
import { Link, useNavigate } from "react-router-dom";
import axios from "../../api/axios";
import { useToast } from "../../context/ToastContext";
import { useAuth } from "../../context/AuthContext";
import "../../styles/HomePage.scss";
import { Product } from "../../utils/interface";
import recommendations from "../../utils/recommendations.json";
import ProductItem from "../common/ProductItem";
import Layout from "../layout/Layout";
import { Helmet } from "react-helmet";

const DISPLAYED_NUMBER = 12;

interface Wishlist {
    id: number;
    product: Product;
}

const HomePage = () => {
    const navigate = useNavigate();
    const [products, setProducts] = useState<Product[]>([]);
    const [wishlist, setWishlist] = useState<Wishlist[]>([]);
    const [userRecommendations, setUserRecommendations] = useState<number[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const { userData, loading } = useAuth();
    const uid = userData?.id || null;
    const { addToast } = useToast();

    const handleNext = () => {
        setCurrentIndex((currentIndex + 1) % 4);
    };

    const handlePrev = () => {
        setCurrentIndex((currentIndex - 1 + 4) % 4);
    };

    const slides = [
        {
            title: "Upgrade Your Workspace",
            subtitle: "Shop premium laptops, monitors, and smart gear curated for focus and performance.",
            cta: "Shop Work Gear",
        },
        {
            title: "Audio That Hits Different",
            subtitle: "Immersive speakers, noise-cancelling headphones, and studio-grade sound.",
            cta: "Explore Audio",
        },
        {
            title: "Phones, Smarter Every Day",
            subtitle: "Discover the latest smartphones and accessories with fast delivery.",
            cta: "Browse Phones",
        },
        {
            title: "Smart Home Essentials",
            subtitle: "Control, secure, and automate your home with next‑gen devices.",
            cta: "Shop Smart Home",
        },
    ];

    const toggleWishlist = async (user_id: string, product_id: number) => {
        console.log("UID in toggle wishlist:", uid);
        if (!uid) {
            addToast("Login required", "You need to login to use this feature.");
            return;
        }
        try {
            const exists = wishlist.some((item) => item.product.id === product_id);
            if (exists) {
                const response = await axios.delete(`/api/wishlist/${product_id}/`, {
                    data: {
                        uid: user_id,
                    },
                });
                if (response.status === 200) {
                    console.log(response.data.msg);
                    setWishlist((list) => list.filter((item) => item.product.id !== product_id));
                    addToast("Remove wishlist item", "Item removed from wishlist successfully");
                }
            } else {
                const response = await axios.post("/api/wishlist/", {
                    uid: user_id,
                    pid: product_id,
                });
                if (response.status === 200) {
                    console.log(response.data.msg);
                    const newProduct = products.filter((product) => product.id === product_id)[0];
                    setWishlist((list) => [
                        ...list,
                        {
                            id: product_id,
                            product: newProduct,
                        },
                    ]);
                    addToast("Add wishlist item", "Item added to wishlist successfully");
                }
            }
        } catch (error) {
            console.error("Wishlist error:", error);
            addToast("Error", "Something went wrong");
        }
    };
    const handleAddingCart = async (user_id: string, product_id: number) => {
        if (uid === "") {
            addToast("Login required", "You need to login to use this feature.");
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
        const interval = setInterval(() => {
            setCurrentIndex((prevIndex) => (prevIndex + 1) % 4);
        }, 5000);

        return () => clearInterval(interval); // Dọn dẹp interval khi component unmount
    }, []);

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
        return () => {};
    }, [uid]);

    useEffect(() => {
        const getProductIdsByUserId = (userId: string): number[] => {
            const userProductData = recommendations.find((user) => user.user_id === userId);
            return userProductData ? userProductData.products : [];
        };
        if (userData && !loading) {
            setUserRecommendations(getProductIdsByUserId(userData.id));
        }
        return () => {};
    }, [userData, loading]);

    return (
        <Layout>
            <Helmet>
                <title>Digital-E | Electronics & Gadgets Store</title>
                <meta
                    name="description"
                    content="Shop laptops, phones, audio, accessories, and smart devices with fast delivery and secure checkout."
                />
                <meta property="og:title" content="Digital-E | Electronics & Gadgets Store" />
                <meta
                    property="og:description"
                    content="Shop laptops, phones, audio, accessories, and smart devices with fast delivery and secure checkout."
                />
                {/* Preload only the first image to avoid blocking other resources */}
                <link
                    rel="preload"
                    href="https://epgq6ejr4lgv8lec.public.blob.vercel-storage.com/uploads/carousel_1.jpg"
                    as="image"
                    media="(max-width: 600px)"
                    imageSrcSet="small.jpg 600w, medium.jpg 1200w, large.jpg 2000w"
                />
                {/* Add preconnect to the CDN domain */}
                <link rel="preconnect" href="https://epgq6ejr4lgv8lec.public.blob.vercel-storage.com" />
            </Helmet>

            <main className="home">
                <section className="home__hero">
                    <div className="home__hero__content">
                        <span className="home__hero__badge">Digital‑E Featured</span>
                        <h1>Electronics that feel premium, priced for everyone.</h1>
                        <p>
                            Shop curated tech across laptops, phones, audio, and smart home devices with fast delivery
                            and secure checkout.
                        </p>
                        <div className="home__hero__actions">
                            <button type="button" onClick={() => navigate("/shops")}>
                                Shop All Products <IoArrowForward />
                            </button>
                            <Link to="/news" className="ghost">
                                What&apos;s New
                            </Link>
                        </div>
                        <div className="home__hero__stats">
                            <div>
                                <strong>5K+</strong>
                                <span>Products</span>
                            </div>
                            <div>
                                <strong>24/7</strong>
                                <span>Support</span>
                            </div>
                            <div>
                                <strong>Secure</strong>
                                <span>Checkout</span>
                            </div>
                        </div>
                    </div>
                    <div className="home__hero__slider">
                        <div
                            className="home__hero__slider__track"
                            style={{
                                transform: `translateX(${currentIndex * -100}%)`,
                            }}
                        >
                            {slides.map((slide, index) => (
                                <div className="home__hero__slide" key={`hero-slide-${index}`}>
                                    <img
                                        src={`https://epgq6ejr4lgv8lec.public.blob.vercel-storage.com/uploads/carousel_${
                                            index + 1
                                        }.jpg`}
                                        alt={slide.title}
                                        loading={index > 0 ? "lazy" : "eager"}
                                        width="100%"
                                        height="auto"
                                        decoding="async"
                                    />
                                    <div className="home__hero__slide__overlay">
                                        <h3>{slide.title}</h3>
                                        <p>{slide.subtitle}</p>
                                        <button type="button" onClick={() => navigate("/shops")}>
                                            {slide.cta}
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="home__hero__slider__controls">
                            <button type="button" onClick={handlePrev} aria-label="Previous slide">
                                &#10094;
                            </button>
                            <div className="home__hero__slider__dots">
                                {slides.map((_, index) => (
                                    <button
                                        key={`dot-${index}`}
                                        type="button"
                                        className={currentIndex === index ? "active" : ""}
                                        onClick={() => setCurrentIndex(index)}
                                        aria-label={`Go to slide ${index + 1}`}
                                    />
                                ))}
                            </div>
                            <button type="button" onClick={handleNext} aria-label="Next slide">
                                &#10095;
                            </button>
                        </div>
                    </div>
                </section>

                <section className="home__product">
                    <div className="home__product__header">
                        <h2 className="home__product__header__title">All products</h2>
                        <div>
                            <Link
                                to="/shops"
                                className="view-all-link" // Move styles to CSS
                                aria-label="View all products"
                            >
                                View all <IoArrowForward />
                            </Link>
                        </div>
                    </div>
                    <div className="home__product__menu">
                        {/* Memoize the filtered products if possible */}
                        {useMemo(
                            () =>
                                products
                                    .filter((product) => {
                                        if (uid && userRecommendations.length > 0) {
                                            return userRecommendations.includes(product.id) && product.stock > 0;
                                        }
                                        return product.stock > 0;
                                    })
                                    .slice(0, DISPLAYED_NUMBER)
                                    .map((product) => (
                                        <ProductItem
                                            key={product.id}
                                            product={product}
                                            uid={uid || ""} // Nếu uid là null, truyền vào một chuỗi rỗng
                                            isWishlist={wishlist.some((item) => item.product.id === product.id)}
                                            onToggleWishlist={() => {
                                                if (uid) {
                                                    toggleWishlist(uid, product.id);
                                                } else {
                                                    addToast(
                                                        "Login required",
                                                        "You need to login to use this feature.",
                                                    );
                                                }
                                            }}
                                            onAddingCart={() => {
                                                if (uid) {
                                                    handleAddingCart(uid, product.id);
                                                } else {
                                                    addToast(
                                                        "Login required",
                                                        "You need to login to use this feature.",
                                                    );
                                                }
                                            }}
                                        />
                                    )),
                            [products, uid, userRecommendations, wishlist, DISPLAYED_NUMBER],
                        )}
                    </div>
                </section>
            </main>
        </Layout>
    );
};

export default HomePage;
