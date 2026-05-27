import React, { useEffect, useEffectEvent, useMemo, useOptimistic, useState } from "react";
import { Helmet } from "react-helmet";
import { Link, useNavigate } from "react-router-dom";
import carousel1 from "../assets/images/carousel_1.jpg";
import carousel2 from "../assets/images/carousel_2.jpg";
import carousel3 from "../assets/images/carousel_3.jpg";
import carousel4 from "../assets/images/carousel_4.jpg";
import ProductItem from "../components/common/ProductItem";
import { ArrowLeftIcon, ArrowRightIcon } from "../components/common/Icons";
import Layout from "../components/layout/Layout";
import axios from "../api/axios";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import "../styles/HomePage.scss";
import { Product } from "../utils/interface";
import { HERO_IMAGE_WIDTHS, getResponsiveImageSource, normalizeProductImageName } from "../utils/images";
import loadImage from "../utils/loadImage";

const DISPLAYED_NUMBER = 12;
const heroSlides = [
    {
        image: carousel1,
        kicker: "Workspace deals",
        title: "Upgrade your workspace without the clutter.",
        subtitle: "Premium laptops, monitors, keyboards, and accessories selected for smoother daily work.",
        cta: "Shop Work Gear",
    },
    {
        image: carousel2,
        kicker: "Audio picks",
        title: "Sound that makes every setup feel alive.",
        subtitle: "Immersive speakers, noise-cancelling headphones, and studio-grade gear for every listener.",
        cta: "Explore Audio",
    },
    {
        image: carousel3,
        kicker: "Mobile essentials",
        title: "Phones and accessories ready for everyday speed.",
        subtitle: "Discover smartphones, chargers, and cases with fast delivery and secure checkout.",
        cta: "Browse Phones",
    },
    {
        image: carousel4,
        kicker: "Smart home",
        title: "Build a smarter home one device at a time.",
        subtitle: "Control, secure, and automate your space with dependable connected devices.",
        cta: "Shop Smart Home",
    },
];

interface Wishlist {
    id: number;
    product: Product;
}

type WishlistMutation =
    | { type: "add"; item: Wishlist }
    | { type: "remove"; productId: number };

const applyWishlistMutation = (wishlist: Wishlist[], mutation: WishlistMutation): Wishlist[] => {
    if (mutation.type === "remove") {
        return wishlist.filter((item) => item.product.id !== mutation.productId);
    }

    if (wishlist.some((item) => item.product.id === mutation.item.product.id)) {
        return wishlist;
    }

    return [...wishlist, mutation.item];
};

const HomePage = () => {
    const navigate = useNavigate();
    const [products, setProducts] = useState<Product[]>([]);
    const [isLoadingProducts, setIsLoadingProducts] = useState(true);
    const [smartRecommendations, setSmartRecommendations] = useState<Product[]>([]);
    const [wishlist, setWishlist] = useState<Wishlist[]>([]);
    const [pendingWishlistIds, setPendingWishlistIds] = useState<number[]>([]);
    const [activeFilter, setActiveFilter] = useState<"recommended" | "popular" | "new">("recommended");
    const [currentIndex, setCurrentIndex] = useState(0);
    const { userData, loading } = useAuth();
    const uid = userData?.id || null;
    const { addToast } = useToast();
    const [optimisticWishlist, applyOptimisticWishlist] = useOptimistic(
        wishlist,
        (currentWishlist: Wishlist[], mutation: WishlistMutation) => applyWishlistMutation(currentWishlist, mutation),
    );
    const wishlistIdSet = useMemo(() => new Set(optimisticWishlist.map((item) => item.product.id)), [optimisticWishlist]);
    const advanceSlide = useEffectEvent(() => {
        setCurrentIndex((prevIndex) => (prevIndex + 1) % heroSlides.length);
    });

    const handleNext = () => {
        setCurrentIndex((currentIndex + 1) % heroSlides.length);
    };

    const handlePrev = () => {
        setCurrentIndex((currentIndex - 1 + heroSlides.length) % heroSlides.length);
    };

    const toggleWishlist = async (user_id: string, product_id: number) => {
        if (!uid) {
            addToast("Login required", "You need to login to use this feature.");
            return;
        }
        if (pendingWishlistIds.includes(product_id)) {
            return;
        }

        const exists = wishlistIdSet.has(product_id);
        const optimisticProduct = products.find((product) => product.id === product_id);
        const mutation: WishlistMutation | null = exists
            ? { type: "remove", productId: product_id }
            : optimisticProduct
              ? {
                    type: "add",
                    item: {
                        id: product_id,
                        product: optimisticProduct,
                    },
                }
              : null;

        setPendingWishlistIds((prev) => [...prev, product_id]);
        if (mutation) {
            applyOptimisticWishlist(mutation);
        }
        addToast("Wishlist updated", exists ? "Item removed from wishlist." : "Item added to wishlist.");

        try {
            if (exists) {
                const response = await axios.delete(`/api/wishlist/${product_id}/`, {
                    data: {
                        uid: user_id,
                    },
                });
                if (response.status !== 200) {
                    throw new Error("Wishlist delete failed");
                }
                if (mutation) {
                    setWishlist((list) => applyWishlistMutation(list, mutation));
                }
            } else {
                const response = await axios.post("/api/wishlist/", {
                    uid: user_id,
                    pid: product_id,
                });
                if (response.status !== 200) {
                    throw new Error("Wishlist add failed");
                }
                if (mutation) {
                    setWishlist((list) => applyWishlistMutation(list, mutation));
                }
            }
        } catch {
            addToast("Wishlist", "Unable to update wishlist. Please try again.");
        } finally {
            setPendingWishlistIds((prev) => prev.filter((id) => id !== product_id));
        }
    };

    const handleAddingCart = async (user_id: string, product_id: number) => {
        if (!uid) {
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
                addToast("Add cart item", "Product added to cart successfully");
            }
        } catch {
            addToast("Add cart item", "Unable to add item to cart.");
        }
    };

    useEffect(() => {
        const interval = setInterval(() => {
            advanceSlide();
        }, 5000);

        return () => clearInterval(interval);
    }, [advanceSlide]);

    useEffect(() => {
        const fetchProducts = async () => {
            setIsLoadingProducts(true);
            try {
                const response = await axios.get(`/api/products?page=1&limit=${DISPLAYED_NUMBER * 5}`);
                if (response.status === 200) {
                    setProducts(response.data.products);
                }
            } catch {
                addToast("Products", "Unable to load products right now.");
            } finally {
                setIsLoadingProducts(false);
            }
        };
        fetchProducts();
    }, [addToast]);

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
    }, [uid]);

    useEffect(() => {
        const fetchRecommendations = async () => {
            if (!userData || loading) {
                setSmartRecommendations([]);
                return;
            }

            try {
                const response = await axios.get(`/api/products/recommendations/${userData.id}?limit=${DISPLAYED_NUMBER}`);
                if (response.status === 200) {
                    setSmartRecommendations(
                        (response.data.products || []).map((product: Product) => ({
                            ...product,
                            price: Number(product.price) || 0,
                            sale_price: product.sale_price === null ? null : Number(product.sale_price) || null,
                            stock: Number(product.stock) || 0,
                            rating: Number(product.rating) || 0,
                            reviews: Number(product.reviews) || 0,
                        })),
                    );
                }
            } catch {
                setSmartRecommendations([]);
            }
        };

        fetchRecommendations();
    }, [userData, loading]);

    const featuredProducts = useMemo(() => {
        return products.filter((product) => product.stock > 0).slice(0, 3);
    }, [products]);

    const allProducts = useMemo(() => {
        return products.filter((product) => product.stock > 0);
    }, [products]);

    const recommendedProducts = useMemo(() => {
        if (uid && smartRecommendations.length > 0) {
            return smartRecommendations.slice(0, DISPLAYED_NUMBER);
        }
        return allProducts.slice(0, DISPLAYED_NUMBER);
    }, [allProducts, uid, smartRecommendations]);

    const popularProducts = useMemo(() => {
        return [...allProducts].sort((a, b) => (b.rating || 0) - (a.rating || 0)).slice(0, DISPLAYED_NUMBER);
    }, [allProducts]);

    const newProducts = useMemo(() => {
        return [...allProducts].sort((a, b) => (b.id || 0) - (a.id || 0)).slice(0, DISPLAYED_NUMBER);
    }, [allProducts]);

    const displayedProducts = useMemo(() => {
        if (activeFilter === "popular") return popularProducts;
        if (activeFilter === "new") return newProducts;
        return recommendedProducts;
    }, [activeFilter, popularProducts, newProducts, recommendedProducts]);
    const activeSlide = heroSlides[currentIndex] || heroSlides[0];
    const activeHeroImage = getResponsiveImageSource(activeSlide.image, {
        widths: HERO_IMAGE_WIDTHS,
        sizes: "100vw",
        fit: "fill",
    });

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
                <link rel="preload" as="image" href={activeHeroImage.src} fetchPriority="high" />
            </Helmet>

            <main className="home">
                <section className="home__hero" aria-label="Digital-E featured slides">
                    <div className="home__hero__media" aria-hidden="true">
                        <div
                            className="home__hero__media__track"
                            style={{
                                width: `${heroSlides.length * 100}%`,
                                transform: `translateX(-${(currentIndex * 100) / heroSlides.length}%)`,
                            }}
                        >
                            {heroSlides.map((slide, index) => (
                                <div
                                    className="home__hero__media__slide"
                                    key={`hero-slide-${slide.title}`}
                                    style={{ flexBasis: `${100 / heroSlides.length}%` }}
                                >
                                    <img
                                        {...getResponsiveImageSource(slide.image, {
                                            widths: HERO_IMAGE_WIDTHS,
                                            sizes: "100vw",
                                            fit: "fill",
                                        })}
                                        alt={slide.title}
                                        loading={index === currentIndex ? "eager" : "lazy"}
                                        fetchPriority={index === currentIndex ? "high" : "auto"}
                                        decoding="async"
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="home__hero__shade" />
                    <div className="home__hero__content">
                        <span className="home__hero__badge">{activeSlide.kicker}</span>
                        <h1>{activeSlide.title}</h1>
                        <p>{activeSlide.subtitle}</p>
                        <div className="home__hero__actions">
                            <button type="button" onClick={() => navigate("/shops")}>
                                {activeSlide.cta} <ArrowRightIcon />
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
                                <strong>UTC</strong>
                                <span>Order time</span>
                            </div>
                        </div>
                    </div>
                    <div className="home__hero__controls" aria-label="Hero slide controls">
                        <button type="button" onClick={handlePrev} aria-label="Previous slide">
                            <ArrowLeftIcon size={20} />
                        </button>
                        <div className="home__hero__dots">
                            {heroSlides.map((_, index) => (
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
                            <ArrowRightIcon size={20} />
                        </button>
                    </div>
                    <div className="home__hero__previews">
                        {heroSlides.map((slide, index) => (
                            <button
                                key={`preview-${slide.title}`}
                                type="button"
                                className={currentIndex === index ? "active" : ""}
                                onClick={() => setCurrentIndex(index)}
                            >
                                <img src={slide.image} alt="" loading="lazy" decoding="async" />
                                <span>
                                    <small>{String(index + 1).padStart(2, "0")}</small>
                                    <strong>{slide.kicker}</strong>
                                </span>
                            </button>
                        ))}
                    </div>
                </section>

                <section className="home__product">
                    <header className="home__product__header">
                        <div>
                            <span className="home__product__eyebrow">All products</span>
                            <h2 className="home__product__header__title">Curated picks for every setup</h2>
                            <p className="home__product__header__subtitle">
                                Shop what&apos;s trending right now or explore the newest drops.
                            </p>
                        </div>
                        <Link to="/shops" className="home__product__cta">
                            View all products <ArrowRightIcon />
                        </Link>
                    </header>

                    <div className="home__product__filters">
                        <button
                            type="button"
                            className={activeFilter === "recommended" ? "active" : ""}
                            onClick={() => setActiveFilter("recommended")}
                        >
                            Recommended
                        </button>
                        <button
                            type="button"
                            className={activeFilter === "popular" ? "active" : ""}
                            onClick={() => setActiveFilter("popular")}
                        >
                            Popular
                        </button>
                        <button
                            type="button"
                            className={activeFilter === "new" ? "active" : ""}
                            onClick={() => setActiveFilter("new")}
                        >
                            New arrivals
                        </button>
                    </div>

                    <div className="home__product__featured">
                        {isLoadingProducts
                            ? Array.from({ length: 3 }, (_, index) => (
                                  <div
                                      key={`featured-skeleton-${index}`}
                                      className="home__product__featured__card home__product__featured__card--loading"
                                      aria-hidden="true"
                                  >
                                      <div className="home__product__featured__card__info">
                                          <span className="home__skeleton home__skeleton--line home__skeleton--xs" />
                                          <div className="home__skeleton home__skeleton--line home__skeleton--lg" />
                                          <div className="home__skeleton home__skeleton--line home__skeleton--sm" />
                                          <div className="home__skeleton home__skeleton--pill" />
                                      </div>
                                      <div className="home__product__featured__card__img">
                                          <div className="home__skeleton home__skeleton--image" />
                                      </div>
                                  </div>
                              ))
                            : featuredProducts.map((product) => (
                                  <div key={`featured-${product.id}`} className="home__product__featured__card">
                                      <div className="home__product__featured__card__info">
                                          <span>{product.category}</span>
                                          <h3>{product.name}</h3>
                                          <p>{product.brand}</p>
                                          <button type="button" onClick={() => navigate(`/product?id=${product.id}`)}>
                                              View product
                                          </button>
                                      </div>
                                      <div className="home__product__featured__card__img">
                                          {loadImage(
                                              normalizeProductImageName(product.main_image),
                                              product.name,
                                              {
                                                  width: "100%",
                                                  height: "100%",
                                                  objectFit: "cover",
                                                  display: "block",
                                              },
                                              false,
                                              "(min-width: 900px) 18vw, 92vw",
                                          )}
                                      </div>
                                  </div>
                              ))}
                    </div>

                    {isLoadingProducts ? (
                        <div className="home__product__grid home__product__grid--loading" aria-live="polite">
                            {Array.from({ length: DISPLAYED_NUMBER }, (_, index) => (
                                <div
                                    key={`product-skeleton-${index}`}
                                    className="home__product__menu__item home__product__menu__item--loading"
                                    aria-hidden="true"
                                >
                                    <div className="home__product__menu__item__image">
                                        <div className="home__skeleton home__skeleton--image" />
                                    </div>
                                    <div className="home__skeleton home__skeleton--line home__skeleton--xs" />
                                    <div className="home__skeleton home__skeleton--line home__skeleton--md" />
                                    <div className="home__skeleton home__skeleton--line home__skeleton--sm" />
                                    <div className="home__product__menu__item__rating">
                                        <div className="home__skeleton home__skeleton--line home__skeleton--sm" />
                                        <div className="home__skeleton home__skeleton--pill" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="home__product__grid">
                            {displayedProducts.map((product) => (
                                <ProductItem
                                    key={product.id}
                                    product={product}
                                    uid={uid || ""}
                                    isWishlist={wishlistIdSet.has(product.id)}
                                    isWishlistPending={pendingWishlistIds.includes(product.id)}
                                    onToggleWishlist={() => {
                                        if (uid) {
                                            toggleWishlist(uid, product.id);
                                        } else {
                                            addToast("Login required", "You need to login to use this feature.");
                                        }
                                    }}
                                    onAddingCart={() => {
                                        if (uid) {
                                            handleAddingCart(uid, product.id);
                                        } else {
                                            addToast("Login required", "You need to login to use this feature.");
                                        }
                                    }}
                                />
                            ))}
                        </div>
                    )}
                </section>
            </main>
        </Layout>
    );
};

export default HomePage;
