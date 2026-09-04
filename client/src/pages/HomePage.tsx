import React, { useCallback, useEffect, useEffectEvent, useMemo, useOptimistic, useState } from "react";
import { Helmet } from "react-helmet";
import { Link, useLocation, useNavigate } from "react-router-dom";
import carousel1 from "../assets/images/carousel_1.jpg";
import carousel2 from "../assets/images/carousel_2.jpg";
import carousel3 from "../assets/images/carousel_3.jpg";
import carousel4 from "../assets/images/carousel_4.jpg";
import ProductItem from "../components/common/ProductItem";
import RecentlyViewedStrip from "../components/common/RecentlyViewedStrip";
import { FeaturedProductSkeletons, ProductGridSkeleton } from "../components/common/StorefrontSkeleton";
import { ArrowLeftIcon, ArrowRightIcon } from "../components/common/Icons";
import Layout from "../components/layout/Layout";
import axios from "../api/axios";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import "../styles/pages/_home.scss";
import { Product } from "../utils/interface";
import { HERO_IMAGE_WIDTHS, THUMBNAIL_IMAGE_WIDTHS, getResponsiveImageSource, normalizeProductImageName } from "../utils/images";
import loadImage from "../utils/loadImage";
import { normalizeProduct, normalizeProducts } from "../utils/product";
import { useRecentlyViewed } from "../hooks/useRecentlyViewed";
import { useT } from "../hooks/useT";

const DISPLAYED_NUMBER = 12;
const HOME_PRODUCT_LIMIT = DISPLAYED_NUMBER * 2;

type HomeTab = "recommended" | "popular" | "new";
const HOME_TABS: HomeTab[] = ["recommended", "popular", "new"];

const isHomeTab = (value: string | null): value is HomeTab =>
    value === "recommended" || value === "popular" || value === "new";

const heroSlides = [
    {
        image: carousel1,
        title: "Premium laptops & monitors",
        cta: "Shop Work Gear",
    },
    {
        image: carousel2,
        title: "Headphones & speakers",
        cta: "Explore Audio",
    },
    {
        image: carousel3,
        title: "Phones & accessories",
        cta: "Browse Phones",
    },
    {
        image: carousel4,
        title: "Smart home devices",
        cta: "Shop Smart Home",
    },
];

const heroCtaKey: Record<string, "heroCta" | "heroCtaExplore" | "heroCtaBrowse" | "heroCtaSmartHome"> = {
    "Shop Work Gear": "heroCta",
    "Explore Audio": "heroCtaExplore",
    "Browse Phones": "heroCtaBrowse",
    "Shop Smart Home": "heroCtaSmartHome",
};

const heroImageSources = heroSlides.map((slide) =>
    getResponsiveImageSource(slide.image, {
        widths: HERO_IMAGE_WIDTHS,
        sizes: "100vw",
        fit: "fill",
    }),
);

const heroPreviewSources = heroSlides.map((slide) =>
    getResponsiveImageSource(slide.image, {
        widths: THUMBNAIL_IMAGE_WIDTHS,
        sizes: "(min-width: 900px) 12vw, 28vw",
        fit: "fill",
    }),
);

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
    const location = useLocation();
    const t = useT();
    const [products, setProducts] = useState<Product[]>([]);
    const [isLoadingProducts, setIsLoadingProducts] = useState(true);
    const [smartRecommendations, setSmartRecommendations] = useState<Product[]>([]);
    const [wishlist, setWishlist] = useState<Wishlist[]>([]);
    const [pendingWishlistIds, setPendingWishlistIds] = useState<number[]>([]);
    const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
    const tabFromUrl = searchParams.get("tab");
    const initialTab: HomeTab = isHomeTab(tabFromUrl) ? tabFromUrl : "recommended";
    const [activeFilter, setActiveFilter] = useState<HomeTab>(initialTab);
    const [currentIndex, setCurrentIndex] = useState(0);
    const { userData, loading } = useAuth();
    const uid = userData?.id || null;
    const { addToast } = useToast();
    const { items: recentlyViewed, track: trackRecentlyViewed } = useRecentlyViewed();
    const [optimisticWishlist, applyOptimisticWishlist] = useOptimistic(
        wishlist,
        (currentWishlist: Wishlist[], mutation: WishlistMutation) => applyWishlistMutation(currentWishlist, mutation),
    );
    const wishlistIdSet = useMemo(() => new Set(optimisticWishlist.map((item) => item.product.id)), [optimisticWishlist]);
    const pendingWishlistIdSet = useMemo(() => new Set(pendingWishlistIds), [pendingWishlistIds]);
    const advanceSlide = useEffectEvent(() => {
        setCurrentIndex((prevIndex) => (prevIndex + 1) % heroSlides.length);
    });

    const handleNext = useCallback(() => {
        setCurrentIndex((prevIndex) => (prevIndex + 1) % heroSlides.length);
    }, []);

    const handlePrev = useCallback(() => {
        setCurrentIndex((prevIndex) => (prevIndex - 1 + heroSlides.length) % heroSlides.length);
    }, []);

    const handleTabChange = useCallback(
        (tab: HomeTab) => {
            setActiveFilter(tab);
            const nextParams = new URLSearchParams(location.search);
            if (tab === "recommended") {
                nextParams.delete("tab");
            } else {
                nextParams.set("tab", tab);
            }
            const nextSearch = nextParams.toString();
            navigate(nextSearch ? `${location.pathname}?${nextSearch}` : location.pathname, {
                replace: true,
            });
        },
        [location.pathname, location.search, navigate],
    );

    useEffect(() => {
        if (!isHomeTab(tabFromUrl)) {
            if (activeFilter !== "recommended") {
                setActiveFilter("recommended");
            }
            return;
        }
        if (tabFromUrl !== activeFilter) {
            setActiveFilter(tabFromUrl);
        }
    }, [tabFromUrl, activeFilter]);

    const toggleWishlist = useCallback(async (user_id: string, product_id: number) => {
        if (!uid) {
            addToast("Login required", "You need to login to use this feature.");
            return;
        }
        if (pendingWishlistIdSet.has(product_id)) {
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
    }, [addToast, applyOptimisticWishlist, pendingWishlistIdSet, products, uid, wishlistIdSet]);

    const handleAddingCart = useCallback(async (user_id: string, product_id: number) => {
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
    }, [addToast, uid]);

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
                const response = await axios.get(`/api/products?page=1&limit=${HOME_PRODUCT_LIMIT}`);
                if (response.status === 200) {
                    setProducts(normalizeProducts(response.data.products));
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
                                product: normalizeProduct({ id: product_id, ...productProps }),
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
                        normalizeProducts(response.data.products),
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
    const activeHeroImage = heroImageSources[currentIndex] || heroImageSources[0];

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
                    <div className="home__hero__inner">
                    <div className="home__hero__shade" />
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
                                        {...heroImageSources[index]}
                                        alt={slide.title}
                                        loading={index === currentIndex ? "eager" : "lazy"}
                                        fetchPriority={index === currentIndex ? "high" : "auto"}
                                        decoding="async"
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="home__hero__content">
                        <h1>{activeSlide.title}</h1>
                        <div className="home__hero__actions">
                            <button type="button" onClick={() => navigate("/shops")}>
                                {t(`home.${heroCtaKey[activeSlide.cta] ?? "heroCta"}`)} <ArrowRightIcon />
                            </button>
                            <Link to="/news" className="ghost">
                                {t("home.newArrivals")}
                            </Link>
                        </div>
                        <div className="home__hero__stats">
                            <div>
                                <strong>5K+</strong>
                                <span>{t("home.statsProducts")}</span>
                            </div>
                            <div>
                                <strong>24/7</strong>
                                <span>{t("home.statsSupport")}</span>
                            </div>
                            <div>
                                <strong>UTC</strong>
                                <span>{t("home.statsOrder")}</span>
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
                    </div>
                    <div className="home__hero__previews">
                        {heroSlides.map((slide, index) => (
                            <button
                                key={`preview-${slide.title}`}
                                type="button"
                                className={currentIndex === index ? "active" : ""}
                                onClick={() => setCurrentIndex(index)}
                            >
                                <img
                                    src={heroPreviewSources[index].src}
                                    srcSet={heroPreviewSources[index].srcSet}
                                    sizes={heroPreviewSources[index].sizes}
                                    alt=""
                                    loading="lazy"
                                    decoding="async"
                                />
                            </button>
                        ))}
                    </div>
                    </div>
                </section>

                <section className="home__product app-page">
                    <header className="home__product__header">
                        <div>
                            <h2 className="home__product__header__title">{t("home.productsHeading")}</h2>
                        </div>
                        <Link to="/shops" className="home__product__cta">
                            {t("home.viewAllProducts")} <ArrowRightIcon />
                        </Link>
                    </header>

                    <div className="home__product__filters" role="tablist">
                        {HOME_TABS.map((tab) => (
                            <button
                                key={tab}
                                type="button"
                                role="tab"
                                aria-selected={activeFilter === tab}
                                className={activeFilter === tab ? "active" : ""}
                                onClick={() => handleTabChange(tab)}
                            >
                                {tab === "recommended"
                                    ? t("home.tabRecommended")
                                    : tab === "popular"
                                      ? t("home.tabPopular")
                                      : t("home.tabNew")}
                            </button>
                        ))}
                    </div>

                    <div className="home__product__featured">
                        {isLoadingProducts
                            ? <FeaturedProductSkeletons count={3} />
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
                        <div aria-live="polite">
                            <ProductGridSkeleton count={DISPLAYED_NUMBER} className="home__product__grid" />
                        </div>
                    ) : (
                        <div className="home__product__grid">
                            {displayedProducts.map((product) => (
                                <ProductItem
                                    key={product.id}
                                    product={product}
                                    uid={uid || ""}
                                    isWishlist={wishlistIdSet.has(product.id)}
                                    isWishlistPending={pendingWishlistIdSet.has(product.id)}
                                    onToggleWishlist={toggleWishlist}
                                    onAddingCart={handleAddingCart}
                                />
                            ))}
                        </div>
                    )}
                </section>

                <RecentlyViewedStrip
                    items={recentlyViewed}
                    onSelect={(productId) => {
                        const candidate =
                            displayedProducts.find((p) => p.id === productId) ??
                            products.find((p) => p.id === productId) ??
                            recentlyViewed.find((p) => p.id === productId);
                        if (candidate) {
                            trackRecentlyViewed(candidate);
                        }
                        navigate(`/product?id=${productId}`);
                    }}
                />
            </main>
        </Layout>
    );
};

export default HomePage;
