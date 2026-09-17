import React, {
    useCallback,
    useEffect,
    useMemo,
    useOptimistic,
    useState,
} from "react";
import { Helmet } from "react-helmet-async";
import { Link, useLocation, useNavigate } from "react-router-dom";
import carousel1 from "../assets/images/carousel_1.jpg";
import carousel2 from "../assets/images/carousel_2.jpg";
import carousel3 from "../assets/images/carousel_3.jpg";
import carousel4 from "../assets/images/carousel_4.jpg";
import productPlaceholder from "../assets/images/product_placeholder.jpg";
import {
    ArrowLeftIcon,
    ArrowRightIcon,
    BoxArrowRightIcon,
    BoxSeamIcon,
    CreditCardIcon,
    SpeedometerIcon,
    TelephoneIcon,
} from "../components/common/Icons";
import ProductItem from "../components/common/ProductItem";
import RecentlyViewedStrip from "../components/common/RecentlyViewedStrip";
import { ProductGridSkeleton } from "../components/common/StorefrontSkeleton";
import Layout from "../components/layout/Layout";
import axios from "../api/axios";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { useToast } from "../context/ToastContext";
import { fetchProduct } from "../features/products/api";
import { useRecentlyViewed } from "../hooks/useRecentlyViewed";
import { useT } from "../hooks/useT";
import "../styles/pages/_home.scss";
import { Product } from "../utils/interface";
import {
    PRODUCT_GALLERY_WIDTHS,
    getProductImageUrl,
    getResponsiveImageSource,
    normalizeProductImageName,
} from "../utils/images";
import { normalizeProduct, normalizeProducts } from "../utils/product";
import { formatCurrency } from "../utils/currency";

const DISPLAYED_NUMBER = 8;
const HOME_PRODUCT_LIMIT = DISPLAYED_NUMBER * 2;
const TRENDING_DISPLAYED_NUMBER = 5;

type HomeTab = "recommended" | "popular" | "new";
const HOME_TABS: HomeTab[] = ["recommended", "popular", "new"];

const isHomeTab = (value: string | null): value is HomeTab =>
    value === "recommended" || value === "popular" || value === "new";

const categoryLinks = [
    {
        key: "gaming",
        labelKey: "home.categoryGaming",
        descriptionKey: "home.categoryGamingBody",
        categories: ["Console"],
        fallback: carousel2,
    },
    {
        key: "laptops",
        labelKey: "home.categoryLaptops",
        descriptionKey: "home.categoryLaptopsBody",
        categories: ["Laptop"],
        fallback: carousel1,
    },
    {
        key: "audio",
        labelKey: "home.categoryAudio",
        descriptionKey: "home.categoryAudioBody",
        categories: ["Headphone", "Speaker"],
        fallback: carousel3,
    },
    {
        key: "components",
        labelKey: "home.categoryComponents",
        descriptionKey: "home.categoryComponentsBody",
        categories: ["Graphics Card", "PC"],
        fallback: carousel4,
    },
    {
        key: "smartHome",
        labelKey: "home.categorySmartHome",
        descriptionKey: "home.categorySmartHomeBody",
        categories: ["Smart Home"],
        fallback: carousel2,
    },
    {
        key: "accessories",
        labelKey: "home.categoryAccessories",
        descriptionKey: "home.categoryAccessoriesBody",
        categories: ["Accessory", "Phone"],
        fallback: carousel3,
    },
] as const;

const valueProps = [
    {
        key: "shipping",
        labelKey: "home.valueShipping",
        bodyKey: "home.valueShippingBody",
        icon: BoxSeamIcon,
    },
    {
        key: "checkout",
        labelKey: "home.valueCheckout",
        bodyKey: "home.valueCheckoutBody",
        icon: SpeedometerIcon,
    },
    {
        key: "payments",
        labelKey: "home.valuePayments",
        bodyKey: "home.valuePaymentsBody",
        icon: CreditCardIcon,
    },
    {
        key: "support",
        labelKey: "home.valueSupport",
        bodyKey: "home.valueSupportBody",
        icon: TelephoneIcon,
    },
    {
        key: "returns",
        labelKey: "home.valueReturns",
        bodyKey: "home.valueReturnsBody",
        icon: BoxArrowRightIcon,
    },
] as const;

const getActivePrice = (product: Product) => {
    const hasSale =
        product.sale_price !== null &&
        product.sale_price > 0 &&
        product.sale_price < product.price;
    return hasSale ? (product.sale_price ?? product.price) : product.price;
};

const getProductImageSource = (
    product: Product | undefined,
    sizes: string,
    fallback = productPlaceholder,
) => {
    const source = product?.main_image
        ? getProductImageUrl(normalizeProductImageName(product.main_image))
        : fallback;

    return getResponsiveImageSource(source, {
        widths: PRODUCT_GALLERY_WIDTHS,
        sizes,
        fit: "fit",
    });
};

const getIntentHref = (categories: readonly string[]) =>
    `/shops?categories=${encodeURIComponent(categories.join(","))}&brands=&minPrice=0&maxPrice=100000000&term=`;

interface Wishlist {
    id: number;
    product: Product;
}

type WishlistMutation =
    { type: "add"; item: Wishlist } | { type: "remove"; productId: number };

const applyWishlistMutation = (
    wishlist: Wishlist[],
    mutation: WishlistMutation,
): Wishlist[] => {
    if (mutation.type === "remove") {
        return wishlist.filter(
            (item) => item.product.id !== mutation.productId,
        );
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
    const { userData, loading } = useAuth();
    const uid = userData?.id || null;
    const { addItem } = useCart();
    const { addToast } = useToast();
    const {
        items: recentlyViewed,
        track: trackRecentlyViewed,
        prune: pruneRecentlyViewed,
    } = useRecentlyViewed();
    const [products, setProducts] = useState<Product[]>([]);
    const [isLoadingProducts, setIsLoadingProducts] = useState(true);
    const [smartRecommendations, setSmartRecommendations] = useState<Product[]>(
        [],
    );
    const [wishlist, setWishlist] = useState<Wishlist[]>([]);
    const [pendingWishlistIds, setPendingWishlistIds] = useState<number[]>([]);
    const [isRecentlyViewedValidated, setIsRecentlyViewedValidated] =
        useState(false);
    const [activeFilter, setActiveFilter] = useState<HomeTab>(() => {
        const tab = new URLSearchParams(location.search).get("tab");
        return isHomeTab(tab) ? tab : "recommended";
    });
    const [heroSlideIndex, setHeroSlideIndex] = useState(0);
    const [isHeroPaused, setIsHeroPaused] = useState(false);
    const [optimisticWishlist, applyOptimisticWishlist] = useOptimistic(
        wishlist,
        (currentWishlist: Wishlist[], mutation: WishlistMutation) =>
            applyWishlistMutation(currentWishlist, mutation),
    );

    const searchParams = useMemo(
        () => new URLSearchParams(location.search),
        [location.search],
    );
    const tabFromUrl = searchParams.get("tab");
    const wishlistIdSet = useMemo(
        () => new Set(optimisticWishlist.map((item) => item.product.id)),
        [optimisticWishlist],
    );
    const pendingWishlistIdSet = useMemo(
        () => new Set(pendingWishlistIds),
        [pendingWishlistIds],
    );

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
            navigate(
                nextSearch
                    ? `${location.pathname}?${nextSearch}`
                    : location.pathname,
                { replace: true },
            );
        },
        [location.pathname, location.search, navigate],
    );

    const handleTabKeyDown = useCallback(
        (
            event: React.KeyboardEvent<HTMLButtonElement>,
            currentIndex: number,
        ) => {
            let nextIndex: number;
            if (event.key === "ArrowRight" || event.key === "ArrowDown") {
                nextIndex = (currentIndex + 1) % HOME_TABS.length;
            } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
                nextIndex =
                    (currentIndex - 1 + HOME_TABS.length) % HOME_TABS.length;
            } else if (event.key === "Home") {
                nextIndex = 0;
            } else if (event.key === "End") {
                nextIndex = HOME_TABS.length - 1;
            } else {
                return;
            }

            event.preventDefault();
            const nextTab = HOME_TABS[nextIndex];
            handleTabChange(nextTab);
            requestAnimationFrame(() =>
                document.getElementById(`home-tab-${nextTab}`)?.focus(),
            );
        },
        [handleTabChange],
    );

    useEffect(() => {
        if (!isHomeTab(tabFromUrl)) {
            if (activeFilter !== "recommended") setActiveFilter("recommended");
            return;
        }
        if (tabFromUrl !== activeFilter) setActiveFilter(tabFromUrl);
    }, [activeFilter, tabFromUrl]);

    const toggleWishlist = useCallback(
        async (user_id: string, product_id: number) => {
            if (!uid) {
                addToast(
                    "Login required",
                    "You need to login to use this feature.",
                );
                return;
            }
            if (pendingWishlistIdSet.has(product_id)) return;

            const exists = wishlistIdSet.has(product_id);
            const optimisticProduct = products.find(
                (product) => product.id === product_id,
            );
            const mutation: WishlistMutation | null = exists
                ? { type: "remove", productId: product_id }
                : optimisticProduct
                  ? {
                        type: "add",
                        item: { id: product_id, product: optimisticProduct },
                    }
                  : null;

            setPendingWishlistIds((prev) => [...prev, product_id]);
            if (mutation) applyOptimisticWishlist(mutation);
            addToast(
                "Wishlist updated",
                exists
                    ? "Item removed from wishlist."
                    : "Item added to wishlist.",
            );

            try {
                if (exists) {
                    const response = await axios.delete(
                        `/api/wishlist/${product_id}/`,
                        {
                            data: { uid: user_id },
                        },
                    );
                    if (response.status !== 200)
                        throw new Error("Wishlist delete failed");
                } else {
                    const response = await axios.post("/api/wishlist/", {
                        uid: user_id,
                        pid: product_id,
                    });
                    if (response.status !== 200)
                        throw new Error("Wishlist add failed");
                }
                if (mutation)
                    setWishlist((list) =>
                        applyWishlistMutation(list, mutation),
                    );
            } catch {
                addToast(
                    "Wishlist",
                    "Unable to update wishlist. Please try again.",
                );
            } finally {
                setPendingWishlistIds((prev) =>
                    prev.filter((id) => id !== product_id),
                );
            }
        },
        [
            addToast,
            applyOptimisticWishlist,
            pendingWishlistIdSet,
            products,
            uid,
            wishlistIdSet,
        ],
    );

    const handleAddingCart = useCallback(
        async (_user_id: string, product_id: number) => {
            try {
                if (await addItem(product_id, 1)) {
                    addToast(
                        "Add cart item",
                        "Product added to cart successfully",
                    );
                } else {
                    addToast("Add cart item", "Unable to add item to cart.");
                }
            } catch {
                addToast("Add cart item", "Unable to add item to cart.");
            }
        },
        [addItem, addToast],
    );

    useEffect(() => {
        let isActive = true;

        if (recentlyViewed.length === 0) {
            setIsRecentlyViewedValidated(true);
            return () => {
                isActive = false;
            };
        }

        setIsRecentlyViewedValidated(false);
        const validateRecentlyViewed = async () => {
            const validationResults = await Promise.all(
                recentlyViewed.map(async (item) => {
                    try {
                        return {
                            id: item.id,
                            exists: Boolean(await fetchProduct(item.id)),
                        };
                    } catch {
                        return { id: item.id, exists: true };
                    }
                }),
            );

            if (!isActive) return;
            pruneRecentlyViewed(
                new Set(
                    validationResults
                        .filter((result) => result.exists)
                        .map((result) => result.id),
                ),
            );
            setIsRecentlyViewedValidated(true);
        };

        void validateRecentlyViewed();
        return () => {
            isActive = false;
        };
    }, [pruneRecentlyViewed, recentlyViewed]);

    useEffect(() => {
        let isActive = true;
        setIsLoadingProducts(true);

        const fetchProducts = async () => {
            try {
                const response = await axios.get(
                    `/api/products?page=1&limit=${HOME_PRODUCT_LIMIT}`,
                );
                if (isActive && response.status === 200)
                    setProducts(normalizeProducts(response.data.products));
            } catch {
                if (isActive)
                    addToast("Products", "Unable to load products right now.");
            } finally {
                if (isActive) setIsLoadingProducts(false);
            }
        };

        void fetchProducts();
        return () => {
            isActive = false;
        };
    }, [addToast]);

    useEffect(() => {
        let isActive = true;
        if (!uid) {
            setWishlist([]);
            return () => {
                isActive = false;
            };
        }

        const fetchWishlist = async () => {
            try {
                const response = await axios.get(`/api/wishlist/${uid}`);
                if (isActive && response.status === 200) {
                    const nextWishlist: Wishlist[] = (
                        response.data.wishlist || []
                    ).map((item: Record<string, unknown>) => {
                        const { id, product_id, ...productProps } = item;
                        return {
                            id: Number(id),
                            product: normalizeProduct({
                                id: product_id,
                                ...productProps,
                            }),
                        };
                    });
                    setWishlist(nextWishlist);
                }
            } catch {
                if (isActive) addToast("Wishlist", "Unable to load wishlist.");
            }
        };

        void fetchWishlist();
        return () => {
            isActive = false;
        };
    }, [addToast, uid]);

    useEffect(() => {
        let isActive = true;
        if (!userData || loading) {
            setSmartRecommendations([]);
            return () => {
                isActive = false;
            };
        }

        const fetchRecommendations = async () => {
            try {
                const response = await axios.get(
                    `/api/products/recommendations/${userData.id}?limit=${DISPLAYED_NUMBER}`,
                );
                if (isActive && response.status === 200)
                    setSmartRecommendations(
                        normalizeProducts(response.data.products),
                    );
            } catch {
                if (isActive) setSmartRecommendations([]);
            }
        };

        void fetchRecommendations();
        return () => {
            isActive = false;
        };
    }, [loading, userData]);

    const allProducts = useMemo(
        () => products.filter((product) => product.stock > 0),
        [products],
    );
    const featuredProducts = useMemo(
        () => allProducts.slice(0, 3),
        [allProducts],
    );
    const recommendedProducts = useMemo(() => {
        if (uid && smartRecommendations.length > 0)
            return smartRecommendations.slice(0, DISPLAYED_NUMBER);
        return allProducts.slice(0, DISPLAYED_NUMBER);
    }, [allProducts, smartRecommendations, uid]);
    const popularProducts = useMemo(
        () =>
            [...allProducts]
                .sort((left, right) => (right.rating || 0) - (left.rating || 0))
                .slice(0, DISPLAYED_NUMBER),
        [allProducts],
    );
    const newProducts = useMemo(
        () =>
            [...allProducts]
                .sort((left, right) => (right.id || 0) - (left.id || 0))
                .slice(0, DISPLAYED_NUMBER),
        [allProducts],
    );
    const displayedProducts = useMemo(() => {
        if (activeFilter === "popular") return popularProducts;
        if (activeFilter === "new") return newProducts;
        return recommendedProducts;
    }, [activeFilter, newProducts, popularProducts, recommendedProducts]);
    const heroProduct = featuredProducts[heroSlideIndex] || featuredProducts[0];
    const heroHasSale = Boolean(
        heroProduct &&
        heroProduct.sale_price !== null &&
        heroProduct.sale_price > 0 &&
        heroProduct.sale_price < heroProduct.price,
    );
    const heroDiscount =
        heroHasSale && heroProduct
            ? Math.round(
                  (1 - getActivePrice(heroProduct) / heroProduct.price) * 100,
              )
            : 0;
    const shelfProducts = useMemo(
        () => displayedProducts.slice(0, TRENDING_DISPLAYED_NUMBER),
        [displayedProducts],
    );
    const categoryProducts = useMemo(
        () =>
            categoryLinks.map((category) => ({
                ...category,
                product: allProducts.find((product) =>
                    category.categories.some((value) =>
                        product.category
                            ?.toLowerCase()
                            .includes(value.toLowerCase()),
                    ),
                ),
            })),
        [allProducts],
    );

    const changeHeroSlide = useCallback(
        (direction: number) => {
            setHeroSlideIndex((current) => {
                if (featuredProducts.length === 0) return 0;
                return (
                    (current + direction + featuredProducts.length) %
                    featuredProducts.length
                );
            });
        },
        [featuredProducts.length],
    );

    useEffect(() => {
        setHeroSlideIndex((current) =>
            Math.min(current, Math.max(featuredProducts.length - 1, 0)),
        );
    }, [featuredProducts.length]);

    useEffect(() => {
        if (
            featuredProducts.length < 2 ||
            isHeroPaused ||
            typeof window === "undefined"
        )
            return;
        if (
            typeof window.matchMedia === "function" &&
            window.matchMedia("(prefers-reduced-motion: reduce)").matches
        )
            return;

        const intervalId = window.setInterval(() => changeHeroSlide(1), 5200);
        return () => window.clearInterval(intervalId);
    }, [changeHeroSlide, featuredProducts.length, isHeroPaused]);

    useEffect(() => {
        if (typeof document === "undefined") return;
        const revealNodes = Array.from(
            document.querySelectorAll<HTMLElement>(".home [data-reveal]"),
        );
        if (revealNodes.length === 0) return;

        if (typeof IntersectionObserver === "undefined") {
            revealNodes.forEach((node) => node.classList.add("is-visible"));
            return;
        }

        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (!entry.isIntersecting) return;
                    entry.target.classList.add("is-visible");
                    observer.unobserve(entry.target);
                });
            },
            { rootMargin: "0px 0px -10%", threshold: 0.08 },
        );

        revealNodes.forEach((node) => observer.observe(node));
        return () => observer.disconnect();
    }, [isLoadingProducts, shelfProducts.length]);
    const heroImageSource = useMemo(
        () =>
            getProductImageSource(
                heroProduct,
                "(min-width: 1040px) 34vw, 86vw",
            ),
        [heroProduct],
    );
    const heroProductPath = heroProduct
        ? `/product?id=${heroProduct.id}`
        : "/shops";

    return (
        <Layout>
            <Helmet>
                <title>Digital-E | Everyday electronics, better chosen</title>
                <meta
                    name="description"
                    content="Find practical electronics for work, play, listening, and everyday life with clear stock and checkout."
                />
                <meta
                    property="og:title"
                    content="Digital-E | Everyday electronics, better chosen"
                />
                <meta
                    property="og:description"
                    content="Find practical electronics for work, play, listening, and everyday life with clear stock and checkout."
                />
                <link
                    rel="preload"
                    as="image"
                    href={heroImageSource.src}
                    fetchPriority="high"
                />
            </Helmet>

            <div className="home">
                <section
                    className="home__hero"
                    aria-labelledby="home-hero-title"
                >
                    <div className="home__hero__inner">
                        <div className="home__hero__copy">
                            <p className="home__hero__kicker">
                                {t("home.heroKicker")}
                            </p>
                            <h1 id="home-hero-title">{t("home.heroTitle")}</h1>
                            <p className="home__hero__body">
                                {t("home.heroBody")}
                            </p>
                            <div className="home__hero__actions">
                                <Link
                                    className="home__button home__button--primary"
                                    to="/shops"
                                >
                                    {t("home.heroPrimary")}{" "}
                                    <ArrowRightIcon size={18} />
                                </Link>
                                <Link
                                    className="home__button home__button--quiet"
                                    to="/news"
                                >
                                    {t("home.heroSecondary")}
                                </Link>
                            </div>
                            <div
                                className="home__hero__availability"
                                aria-live="polite"
                            >
                                <span
                                    className="home__hero__availability__indicator"
                                    aria-hidden="true"
                                />
                                {isLoadingProducts ? (
                                    <span>{t("home.catalogLoading")}</span>
                                ) : (
                                    <span>
                                        <strong>{allProducts.length}</strong>{" "}
                                        {t("home.catalogReady")}
                                    </span>
                                )}
                            </div>
                            <div
                                className="home__hero__signals"
                                aria-label={t("home.heroSignalsLabel")}
                            >
                                <span>{t("home.heroSignalWork")}</span>
                                <span>{t("home.heroSignalPlay")}</span>
                                <span>{t("home.heroSignalCreate")}</span>
                                <span>{t("home.heroSignalLive")}</span>
                            </div>
                        </div>

                        <div
                            className="home__hero__visual"
                            role="group"
                            aria-label={
                                heroProduct
                                    ? t("home.heroFeaturedLabel") +
                                      ": " +
                                      heroProduct.name
                                    : t("home.heroPreviewLabel")
                            }
                        >
                            <div
                                className="home__hero__board"
                                aria-hidden="true"
                            >
                                <img
                                    src={carousel1}
                                    alt=""
                                    width={1600}
                                    height={900}
                                    loading="eager"
                                    decoding="async"
                                />
                                <span className="home__hero__board__trace home__hero__board__trace--one" />
                                <span className="home__hero__board__trace home__hero__board__trace--two" />
                                <span className="home__hero__board__node home__hero__board__node--one" />
                                <span className="home__hero__board__node home__hero__board__node--two" />
                            </div>
                            <div
                                className="home__hero__readout"
                                aria-hidden="true"
                            >
                                <span>{t("home.heroAvailability")}</span>
                                <strong>
                                    {heroProduct
                                        ? heroProduct.stock > 0
                                            ? t("home.heroReady")
                                            : t("home.heroOutOfStock")
                                        : t("home.heroLoading")}
                                </strong>
                            </div>
                            <article
                                className="home__hero__ticket"
                                key={heroProduct?.id || "loading"}
                                aria-live="polite"
                            >
                                <div className="home__hero__ticket__topline">
                                    <span>{t("home.heroDealLabel")}</span>
                                    {heroHasSale ? (
                                        <span className="home__hero__ticket__discount">
                                            {t(
                                                "home.dealDiscount",
                                                heroDiscount,
                                            )}
                                        </span>
                                    ) : null}
                                </div>
                                <Link
                                    to={heroProductPath}
                                    className="home__hero__ticket__image"
                                    aria-label={
                                        heroProduct
                                            ? t("home.viewProduct") +
                                              ": " +
                                              heroProduct.name
                                            : t("home.heroPreviewLabel")
                                    }
                                >
                                    <img
                                        {...heroImageSource}
                                        alt={
                                            heroProduct?.name ||
                                            "Featured product preview"
                                        }
                                        width={640}
                                        height={640}
                                        loading="eager"
                                        fetchPriority="high"
                                        decoding="async"
                                        onError={(event) => {
                                            event.currentTarget.src =
                                                productPlaceholder;
                                        }}
                                    />
                                </Link>
                                <div className="home__hero__ticket__content">
                                    <p>
                                        {heroProduct?.category ||
                                            t("home.catalogFallback")}
                                    </p>
                                    <h2>
                                        {heroProduct?.name ||
                                            t("home.heroLoading")}
                                    </h2>
                                    <span>{t("home.heroDealBody")}</span>
                                    <div className="home__hero__ticket__price">
                                        <strong>
                                            {heroProduct
                                                ? formatCurrency(
                                                      getActivePrice(
                                                          heroProduct,
                                                      ),
                                                  )
                                                : "—"}
                                        </strong>
                                        {heroHasSale && heroProduct ? (
                                            <del>
                                                {formatCurrency(
                                                    heroProduct.price,
                                                )}
                                            </del>
                                        ) : null}
                                    </div>
                                    <div className="home__hero__ticket__footer">
                                        <span className="home__hero__ticket__stock">
                                            <span aria-hidden="true" />{" "}
                                            {heroProduct?.stock || 0}{" "}
                                            {t("home.stockReady")}
                                        </span>
                                        <Link to={heroProductPath}>
                                            {t("home.viewProduct")}{" "}
                                            <ArrowRightIcon size={16} />
                                        </Link>
                                    </div>
                                </div>
                            </article>
                            {featuredProducts.length > 1 ? (
                                <div
                                    className="home__hero__controls"
                                    aria-label={t("home.heroCarouselLabel")}
                                >
                                    <button
                                        type="button"
                                        onClick={() => changeHeroSlide(-1)}
                                        aria-label={t("home.heroPrevious")}
                                    >
                                        <ArrowLeftIcon size={17} />
                                    </button>
                                    <button
                                        type="button"
                                        className="home__hero__controls__pause"
                                        onClick={() =>
                                            setIsHeroPaused((paused) => !paused)
                                        }
                                        aria-label={
                                            isHeroPaused
                                                ? t("home.heroPlay")
                                                : t("home.heroPause")
                                        }
                                        aria-pressed={isHeroPaused}
                                    >
                                        {isHeroPaused ? "▶" : "Ⅱ"}
                                    </button>
                                    <div className="home__hero__dots">
                                        {featuredProducts.map(
                                            (product, index) => (
                                                <button
                                                    key={product.id}
                                                    type="button"
                                                    className={
                                                        index === heroSlideIndex
                                                            ? "is-active"
                                                            : ""
                                                    }
                                                    onClick={() =>
                                                        setHeroSlideIndex(index)
                                                    }
                                                    aria-label={t(
                                                        "home.heroSlide",
                                                        index + 1,
                                                    )}
                                                    aria-current={
                                                        index === heroSlideIndex
                                                            ? "true"
                                                            : undefined
                                                    }
                                                />
                                            ),
                                        )}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => changeHeroSlide(1)}
                                        aria-label={t("home.heroNext")}
                                    >
                                        <ArrowRightIcon size={17} />
                                    </button>
                                </div>
                            ) : null}
                        </div>
                    </div>
                </section>

                <section
                    className="home__categories"
                    aria-labelledby="home-category-title"
                    data-reveal
                >
                    <div className="home__section-frame">
                        <header className="home__section-header">
                            <div>
                                <p className="home__section-kicker">
                                    {t("home.categoryKicker")}
                                </p>
                                <h2 id="home-category-title">
                                    {t("home.categoryTitle")}
                                </h2>
                            </div>
                            <Link className="home__text-link" to="/shops">
                                {t("home.viewAllCategories")}{" "}
                                <ArrowRightIcon size={17} />
                            </Link>
                        </header>
                        <nav
                            className="home__category-grid"
                            aria-label={t("home.categoryTitle")}
                        >
                            {categoryProducts.map((category) => {
                                const imageSource = getProductImageSource(
                                    category.product,
                                    "(min-width: 1040px) 15vw, 70vw",
                                    category.fallback,
                                );
                                return (
                                    <Link
                                        key={category.key}
                                        to={getIntentHref(category.categories)}
                                        className={
                                            "home__category home__category--" +
                                            category.key
                                        }
                                        aria-label={t(category.labelKey)}
                                    >
                                        <span className="home__category__media">
                                            <img
                                                {...imageSource}
                                                alt=""
                                                width={420}
                                                height={290}
                                                loading="lazy"
                                                decoding="async"
                                            />
                                        </span>
                                        <span className="home__category__body">
                                            <strong>
                                                {t(category.labelKey)}
                                            </strong>
                                            <span>
                                                {t(category.descriptionKey)}
                                            </span>
                                        </span>
                                        <ArrowRightIcon
                                            className="home__category__arrow"
                                            size={17}
                                        />
                                    </Link>
                                );
                            })}
                        </nav>
                    </div>
                </section>

                <section
                    className="home__trending"
                    aria-labelledby="home-trending-title"
                    data-reveal
                >
                    <div className="home__section-frame">
                        <header className="home__section-header home__trending__header">
                            <div>
                                <p className="home__section-kicker">
                                    {t("home.trendingKicker")}
                                </p>
                                <h2 id="home-trending-title">
                                    {t("home.trendingTitle")}
                                </h2>
                            </div>
                            <Link className="home__text-link" to="/shops">
                                {t("home.viewAllProducts")}{" "}
                                <ArrowRightIcon size={17} />
                            </Link>
                        </header>

                        <div className="home__trending__toolbar">
                            <div
                                className="home__shelf__tabs"
                                role="tablist"
                                aria-label={t("home.trendingTitle")}
                            >
                                {HOME_TABS.map((tab, index) => (
                                    <button
                                        key={tab}
                                        id={"home-tab-" + tab}
                                        type="button"
                                        role="tab"
                                        aria-selected={activeFilter === tab}
                                        aria-controls="home-trending-panel"
                                        tabIndex={activeFilter === tab ? 0 : -1}
                                        className={
                                            activeFilter === tab
                                                ? "is-active"
                                                : ""
                                        }
                                        onClick={() => handleTabChange(tab)}
                                        onKeyDown={(event) =>
                                            handleTabKeyDown(event, index)
                                        }
                                    >
                                        {tab === "recommended"
                                            ? t("home.tabRecommended")
                                            : tab === "popular"
                                              ? t("home.tabPopular")
                                              : t("home.tabNew")}
                                    </button>
                                ))}
                            </div>
                            <div
                                className="home__trending__arrows"
                                aria-hidden="true"
                            >
                                <span>01</span>
                                <span className="home__trending__rule" />
                                <span>05</span>
                            </div>
                        </div>

                        {isLoadingProducts ? (
                            <div
                                className="home__shelf__loading"
                                id="home-trending-panel"
                                role="tabpanel"
                                aria-labelledby={"home-tab-" + activeFilter}
                                aria-live="polite"
                            >
                                <ProductGridSkeleton
                                    count={DISPLAYED_NUMBER}
                                    className="home__shelf__grid"
                                />
                            </div>
                        ) : (
                            <div
                                className="home__shelf__content"
                                id="home-trending-panel"
                                role="tabpanel"
                                aria-labelledby={"home-tab-" + activeFilter}
                            >
                                {shelfProducts.length > 0 ? (
                                    <div className="home__shelf__grid">
                                        {shelfProducts.map((product) => (
                                            <ProductItem
                                                key={product.id}
                                                product={product}
                                                uid={uid || ""}
                                                isWishlist={wishlistIdSet.has(
                                                    product.id,
                                                )}
                                                isWishlistPending={pendingWishlistIdSet.has(
                                                    product.id,
                                                )}
                                                onToggleWishlist={
                                                    toggleWishlist
                                                }
                                                onAddingCart={handleAddingCart}
                                            />
                                        ))}
                                    </div>
                                ) : (
                                    <div className="home__empty">
                                        <strong>{t("home.emptyTitle")}</strong>
                                        <p>{t("home.emptyBody")}</p>
                                        <Link
                                            className="home__text-link"
                                            to="/shops"
                                        >
                                            {t("home.viewAllProducts")}{" "}
                                            <ArrowRightIcon size={17} />
                                        </Link>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </section>

                <section
                    className="home__value"
                    aria-labelledby="home-value-title"
                    data-reveal
                >
                    <div className="home__section-frame">
                        <header className="home__section-header">
                            <div>
                                <p className="home__section-kicker">
                                    {t("home.valueKicker")}
                                </p>
                                <h2 id="home-value-title">
                                    {t("home.valueTitle")}
                                </h2>
                            </div>
                            <Link className="home__text-link" to="/about-us">
                                {t("home.valueLink")}{" "}
                                <ArrowRightIcon size={17} />
                            </Link>
                        </header>
                        <div className="home__value__grid">
                            {valueProps.map((value) => {
                                const Icon = value.icon;
                                return (
                                    <article
                                        key={value.key}
                                        className="home__value__item"
                                    >
                                        <Icon size={24} />
                                        <div>
                                            <strong>{t(value.labelKey)}</strong>
                                            <p>{t(value.bodyKey)}</p>
                                        </div>
                                    </article>
                                );
                            })}
                        </div>
                    </div>
                </section>

                <section
                    className="home__bundle"
                    aria-labelledby="home-bundle-title"
                    data-reveal
                >
                    <div className="home__bundle__media" aria-hidden="true">
                        <img
                            src={carousel4}
                            alt=""
                            width={1600}
                            height={620}
                            loading="lazy"
                            decoding="async"
                        />
                    </div>
                    <div className="home__bundle__inner">
                        <div className="home__bundle__copy">
                            <p className="home__section-kicker">
                                {t("home.bundleKicker")}
                            </p>
                            <h2 id="home-bundle-title">
                                {t("home.bundleTitle")}
                            </h2>
                            <p>{t("home.bundleBody")}</p>
                            <Link
                                className="home__button home__button--primary"
                                to="/shops"
                            >
                                {t("home.bundleCta")}{" "}
                                <ArrowRightIcon size={18} />
                            </Link>
                        </div>
                        <div className="home__bundle__deal">
                            <span>{t("home.bundleDealLabel")}</span>
                            <strong>{t("home.bundleDealTitle")}</strong>
                            <b>{t("home.bundleDealPrice")}</b>
                            <del>{t("home.bundleDealOriginal")}</del>
                            <span className="home__bundle__deal__discount">
                                {t("home.bundleDealDiscount")}
                            </span>
                        </div>
                    </div>
                </section>

                <RecentlyViewedStrip
                    items={isRecentlyViewedValidated ? recentlyViewed : []}
                    onSelect={(productId) => {
                        const candidate =
                            displayedProducts.find(
                                (product) => product.id === productId,
                            ) ??
                            products.find(
                                (product) => product.id === productId,
                            ) ??
                            recentlyViewed.find(
                                (product) => product.id === productId,
                            );
                        if (candidate) trackRecentlyViewed(candidate);
                        navigate(`/product?id=${productId}`);
                    }}
                />
            </div>
        </Layout>
    );
};

export default HomePage;
