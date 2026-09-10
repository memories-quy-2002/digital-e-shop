import React, { useCallback, useEffect, useMemo, useOptimistic, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link, useLocation, useNavigate } from "react-router-dom";
import carousel1 from "../assets/images/carousel_1.jpg";
import productPlaceholder from "../assets/images/product_placeholder.jpg";
import { ArrowRightIcon, BoxSeamIcon, CheckCircleIcon, HouseIcon, ShieldIcon } from "../components/common/Icons";
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

const DISPLAYED_NUMBER = 8;
const HOME_PRODUCT_LIMIT = DISPLAYED_NUMBER * 2;

type HomeTab = "recommended" | "popular" | "new";
const HOME_TABS: HomeTab[] = ["recommended", "popular", "new"];

const isHomeTab = (value: string | null): value is HomeTab =>
    value === "recommended" || value === "popular" || value === "new";

const intentLinks = [
    {
        key: "make",
        labelKey: "home.intentMake",
        descriptionKey: "home.intentMakeBody",
        categories: ["PC", "Monitor"],
    },
    {
        key: "play",
        labelKey: "home.intentPlay",
        descriptionKey: "home.intentPlayBody",
        categories: ["Console", "Monitor"],
    },
    {
        key: "listen",
        labelKey: "home.intentListen",
        descriptionKey: "home.intentListenBody",
        categories: ["Headphone", "Speaker"],
    },
    {
        key: "connect",
        labelKey: "home.intentConnect",
        descriptionKey: "home.intentConnectBody",
        categories: ["Phone", "Smart Home"],
    },
] as const;

type IntentKey = (typeof intentLinks)[number]["key"];
const intentIcons: Record<IntentKey, React.ComponentType<{ size?: number }>> = {
    make: BoxSeamIcon,
    play: CheckCircleIcon,
    listen: ShieldIcon,
    connect: HouseIcon,
};

const formatCurrency = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
});

const getActivePrice = (product: Product) => {
    const hasSale = product.sale_price !== null && product.sale_price > 0 && product.sale_price < product.price;
    return hasSale ? product.sale_price ?? product.price : product.price;
};

const getProductImageSource = (product: Product | undefined, sizes: string) => {
    const source = product?.main_image
        ? getProductImageUrl(normalizeProductImageName(product.main_image))
        : productPlaceholder;

    return getResponsiveImageSource(source, {
        widths: PRODUCT_GALLERY_WIDTHS,
        sizes,
        fit: "fit",
    });
};

const getIntentHref = (categories: readonly string[]) =>
    `/shops?categories=${encodeURIComponent(categories.join(","))}&brands=&minPrice=0&maxPrice=5000&term=`;

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
    const { userData, loading } = useAuth();
    const uid = userData?.id || null;
    const { addItem } = useCart();
    const { addToast } = useToast();
    const { items: recentlyViewed, track: trackRecentlyViewed, prune: pruneRecentlyViewed } = useRecentlyViewed();
    const [products, setProducts] = useState<Product[]>([]);
    const [isLoadingProducts, setIsLoadingProducts] = useState(true);
    const [smartRecommendations, setSmartRecommendations] = useState<Product[]>([]);
    const [wishlist, setWishlist] = useState<Wishlist[]>([]);
    const [pendingWishlistIds, setPendingWishlistIds] = useState<number[]>([]);
    const [isRecentlyViewedValidated, setIsRecentlyViewedValidated] = useState(false);
    const [activeFilter, setActiveFilter] = useState<HomeTab>(() => {
        const tab = new URLSearchParams(location.search).get("tab");
        return isHomeTab(tab) ? tab : "recommended";
    });
    const [optimisticWishlist, applyOptimisticWishlist] = useOptimistic(
        wishlist,
        (currentWishlist: Wishlist[], mutation: WishlistMutation) => applyWishlistMutation(currentWishlist, mutation),
    );

    const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
    const tabFromUrl = searchParams.get("tab");
    const wishlistIdSet = useMemo(() => new Set(optimisticWishlist.map((item) => item.product.id)), [optimisticWishlist]);
    const pendingWishlistIdSet = useMemo(() => new Set(pendingWishlistIds), [pendingWishlistIds]);

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
            navigate(nextSearch ? `${location.pathname}?${nextSearch}` : location.pathname, { replace: true });
        },
        [location.pathname, location.search, navigate],
    );

    const handleTabKeyDown = useCallback(
        (event: React.KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
            let nextIndex: number;
            if (event.key === "ArrowRight" || event.key === "ArrowDown") {
                nextIndex = (currentIndex + 1) % HOME_TABS.length;
            } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
                nextIndex = (currentIndex - 1 + HOME_TABS.length) % HOME_TABS.length;
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
            requestAnimationFrame(() => document.getElementById(`home-tab-${nextTab}`)?.focus());
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

    const toggleWishlist = useCallback(async (user_id: string, product_id: number) => {
        if (!uid) {
            addToast("Login required", "You need to login to use this feature.");
            return;
        }
        if (pendingWishlistIdSet.has(product_id)) return;

        const exists = wishlistIdSet.has(product_id);
        const optimisticProduct = products.find((product) => product.id === product_id);
        const mutation: WishlistMutation | null = exists
            ? { type: "remove", productId: product_id }
            : optimisticProduct
              ? { type: "add", item: { id: product_id, product: optimisticProduct } }
              : null;

        setPendingWishlistIds((prev) => [...prev, product_id]);
        if (mutation) applyOptimisticWishlist(mutation);
        addToast("Wishlist updated", exists ? "Item removed from wishlist." : "Item added to wishlist.");

        try {
            if (exists) {
                const response = await axios.delete(`/api/wishlist/${product_id}/`, { data: { uid: user_id } });
                if (response.status !== 200) throw new Error("Wishlist delete failed");
            } else {
                const response = await axios.post("/api/wishlist/", { uid: user_id, pid: product_id });
                if (response.status !== 200) throw new Error("Wishlist add failed");
            }
            if (mutation) setWishlist((list) => applyWishlistMutation(list, mutation));
        } catch {
            addToast("Wishlist", "Unable to update wishlist. Please try again.");
        } finally {
            setPendingWishlistIds((prev) => prev.filter((id) => id !== product_id));
        }
    }, [addToast, applyOptimisticWishlist, pendingWishlistIdSet, products, uid, wishlistIdSet]);

    const handleAddingCart = useCallback(async (_user_id: string, product_id: number) => {
        try {
            if (await addItem(product_id, 1)) {
                addToast("Add cart item", "Product added to cart successfully");
            } else {
                addToast("Add cart item", "Unable to add item to cart.");
            }
        } catch {
            addToast("Add cart item", "Unable to add item to cart.");
        }
    }, [addItem, addToast]);

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
                        return { id: item.id, exists: Boolean(await fetchProduct(item.id)) };
                    } catch {
                        return { id: item.id, exists: true };
                    }
                }),
            );

            if (!isActive) return;
            pruneRecentlyViewed(new Set(validationResults.filter((result) => result.exists).map((result) => result.id)));
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
                const response = await axios.get(`/api/products?page=1&limit=${HOME_PRODUCT_LIMIT}`);
                if (isActive && response.status === 200) setProducts(normalizeProducts(response.data.products));
            } catch {
                if (isActive) addToast("Products", "Unable to load products right now.");
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
                    const nextWishlist: Wishlist[] = (response.data.wishlist || []).map((item: Record<string, unknown>) => {
                        const { id, product_id, ...productProps } = item;
                        return {
                            id: Number(id),
                            product: normalizeProduct({ id: product_id, ...productProps }),
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
                const response = await axios.get(`/api/products/recommendations/${userData.id}?limit=${DISPLAYED_NUMBER}`);
                if (isActive && response.status === 200) setSmartRecommendations(normalizeProducts(response.data.products));
            } catch {
                if (isActive) setSmartRecommendations([]);
            }
        };

        void fetchRecommendations();
        return () => {
            isActive = false;
        };
    }, [loading, userData]);

    const allProducts = useMemo(() => products.filter((product) => product.stock > 0), [products]);
    const featuredProducts = useMemo(() => allProducts.slice(0, 3), [allProducts]);
    const recommendedProducts = useMemo(() => {
        if (uid && smartRecommendations.length > 0) return smartRecommendations.slice(0, DISPLAYED_NUMBER);
        return allProducts.slice(0, DISPLAYED_NUMBER);
    }, [allProducts, smartRecommendations, uid]);
    const popularProducts = useMemo(
        () => [...allProducts].sort((left, right) => (right.rating || 0) - (left.rating || 0)).slice(0, DISPLAYED_NUMBER),
        [allProducts],
    );
    const newProducts = useMemo(
        () => [...allProducts].sort((left, right) => (right.id || 0) - (left.id || 0)).slice(0, DISPLAYED_NUMBER),
        [allProducts],
    );
    const displayedProducts = useMemo(() => {
        if (activeFilter === "popular") return popularProducts;
        if (activeFilter === "new") return newProducts;
        return recommendedProducts;
    }, [activeFilter, newProducts, popularProducts, recommendedProducts]);
    const heroProduct = featuredProducts[0];
    const spotlightProduct = featuredProducts[1] || heroProduct;
    const shelfProducts = useMemo(
        () => displayedProducts.filter((product) => product.id !== spotlightProduct?.id).slice(0, 6),
        [displayedProducts, spotlightProduct],
    );
    const heroImageSource = useMemo(
        () => getProductImageSource(heroProduct, "(min-width: 1040px) 34vw, 86vw"),
        [heroProduct],
    );
    const spotlightImageSource = useMemo(
        () => getProductImageSource(spotlightProduct, "(min-width: 1040px) 22vw, 72vw"),
        [spotlightProduct],
    );
    const heroProductPath = heroProduct ? `/product?id=${heroProduct.id}` : "/shops";

    return (
        <Layout>
            <Helmet>
                <title>Digital-E | Everyday electronics, better chosen</title>
                <meta
                    name="description"
                    content="Find practical electronics for work, play, listening, and everyday life with clear stock and checkout."
                />
                <meta property="og:title" content="Digital-E | Everyday electronics, better chosen" />
                <meta
                    property="og:description"
                    content="Find practical electronics for work, play, listening, and everyday life with clear stock and checkout."
                />
                <link rel="preload" as="image" href={heroImageSource.src} fetchPriority="high" />
            </Helmet>

            <div className="home">
                <section className="home__hero" aria-labelledby="home-hero-title">
                    <div className="home__hero__inner">
                        <div className="home__hero__copy">
                            <p className="home__hero__kicker">{t("home.heroKicker")}</p>
                            <h1 id="home-hero-title">{t("home.heroTitle")}</h1>
                            <p className="home__hero__body">{t("home.heroBody")}</p>
                            <div className="home__hero__actions">
                                <Link className="home__button home__button--primary" to="/shops">
                                    {t("home.heroPrimary")} <ArrowRightIcon size={18} />
                                </Link>
                                <Link className="home__button home__button--quiet" to="/news">
                                    {t("home.heroSecondary")}
                                </Link>
                            </div>
                            <div className="home__hero__availability" aria-live="polite">
                                <span className="home__hero__availability__indicator" aria-hidden="true" />
                                {isLoadingProducts ? (
                                    <span>{t("home.catalogLoading")}</span>
                                ) : (
                                    <span><strong>{allProducts.length}</strong> {t("home.catalogReady")}</span>
                                )}
                            </div>
                        </div>

                        <div className="home__hero__visual" role="group" aria-label={heroProduct ? `Featured product: ${heroProduct.name}` : "Featured product preview"}>
                            <div className="home__hero__board" aria-hidden="true">
                                <img src={carousel1} alt="" width={1600} height={900} loading="eager" decoding="async" />
                                <span className="home__hero__board__trace home__hero__board__trace--one" />
                                <span className="home__hero__board__trace home__hero__board__trace--two" />
                            </div>
                            <div className="home__hero__readout" aria-hidden="true">
                                <span>Availability</span>
                                <strong>{heroProduct ? (heroProduct.stock > 0 ? t("home.heroReady") : t("home.heroOutOfStock")) : t("home.heroLoading")}</strong>
                            </div>
                            <article className="home__hero__ticket">
                                <div className="home__hero__ticket__topline">
                                    <span>{t("home.spotlightLabel")}</span>
                                    <span>{heroProduct?.category || t("home.catalogFallback")}</span>
                                </div>
                                <Link to={heroProductPath} className="home__hero__ticket__image" aria-label={heroProduct ? `View ${heroProduct.name}` : "Browse products"}>
                                    <img
                                        {...heroImageSource}
                                        alt={heroProduct?.name || "Featured product preview"}
                                        width={640}
                                        height={640}
                                        loading="eager"
                                        fetchPriority="high"
                                        decoding="async"
                                        onError={(event) => {
                                            event.currentTarget.src = productPlaceholder;
                                        }}
                                    />
                                </Link>
                                <div className="home__hero__ticket__content">
                                    <p>{heroProduct?.brand || "Digital-E"}</p>
                                    <h2>{heroProduct?.name || t("home.heroLoading")}</h2>
                                    <div className="home__hero__ticket__footer">
                                        <strong>{heroProduct ? formatCurrency.format(getActivePrice(heroProduct)) : "—"}</strong>
                                        <Link to={heroProductPath}>{t("home.viewProduct")} <ArrowRightIcon size={16} /></Link>
                                    </div>
                                </div>
                            </article>
                        </div>
                    </div>
                </section>

                <section className="home__intents" aria-labelledby="home-intent-title">
                    <div className="home__section-frame">
                        <div className="home__intents__intro">
                            <div>
                                <p className="home__section-kicker">{t("home.intentTitle")}</p>
                                <h2 id="home-intent-title">{t("home.intentHeading")}</h2>
                            </div>
                            <p>{t("home.intentBody")}</p>
                        </div>
                        <nav className="home__intent-grid" aria-label={t("home.intentTitle")}>
                            {intentLinks.map((intent) => {
                                const Icon = intentIcons[intent.key];
                                return (
                                    <Link
                                        key={intent.key}
                                        to={getIntentHref(intent.categories)}
                                        className={`home__intent home__intent--${intent.key}`}
                                        aria-label={t(intent.labelKey)}
                                    >
                                        <span className="home__intent__icon"><Icon size={23} /></span>
                                        <span className="home__intent__copy">
                                            <strong>{t(intent.labelKey)}</strong>
                                            <span>{t(intent.descriptionKey)}</span>
                                        </span>
                                        <ArrowRightIcon className="home__intent__arrow" size={19} />
                                    </Link>
                                );
                            })}
                        </nav>
                    </div>
                </section>

                <section className="home__shelf" aria-labelledby="home-shelf-title">
                    <div className="home__section-frame">
                        <header className="home__shelf__header">
                            <div>
                                <p className="home__section-kicker">{t("home.shelfKicker")}</p>
                                <h2 id="home-shelf-title">{t("home.shelfTitle")}</h2>
                                <p>{t("home.shelfBody")}</p>
                            </div>
                            <Link className="home__text-link" to="/shops">
                                {t("home.viewAllProducts")} <ArrowRightIcon size={17} />
                            </Link>
                        </header>

                        <div className="home__shelf__tabs" role="tablist" aria-label={t("home.shelfTitle")}>
                            {HOME_TABS.map((tab, index) => (
                                <button
                                    key={tab}
                                    id={`home-tab-${tab}`}
                                    type="button"
                                    role="tab"
                                    aria-selected={activeFilter === tab}
                                    aria-controls="home-shelf-panel"
                                    tabIndex={activeFilter === tab ? 0 : -1}
                                    className={activeFilter === tab ? "is-active" : ""}
                                    onClick={() => handleTabChange(tab)}
                                    onKeyDown={(event) => handleTabKeyDown(event, index)}
                                >
                                    {tab === "recommended"
                                        ? t("home.tabRecommended")
                                        : tab === "popular"
                                          ? t("home.tabPopular")
                                          : t("home.tabNew")}
                                </button>
                            ))}
                        </div>

                        {isLoadingProducts ? (
                            <div className="home__shelf__loading" id="home-shelf-panel" role="tabpanel" aria-labelledby={`home-tab-${activeFilter}`} aria-live="polite">
                                <ProductGridSkeleton count={DISPLAYED_NUMBER} className="home__shelf__grid" />
                            </div>
                        ) : (
                            <div className="home__shelf__content" id="home-shelf-panel" role="tabpanel" aria-labelledby={`home-tab-${activeFilter}`}>
                                {spotlightProduct ? (
                                    <article className="home__spotlight">
                                        <div className="home__spotlight__topline">
                                            <span>{t("home.spotlightLabel")}</span>
                                            <span>{spotlightProduct.stock} {t("home.stockReady")}</span>
                                        </div>
                                        <Link to={`/product?id=${spotlightProduct.id}`} className="home__spotlight__image" aria-label={`View ${spotlightProduct.name}`}>
                                            <img
                                                {...spotlightImageSource}
                                                alt={spotlightProduct.name}
                                                width={720}
                                                height={720}
                                                loading="lazy"
                                                decoding="async"
                                                onError={(event) => {
                                                    event.currentTarget.src = productPlaceholder;
                                                }}
                                            />
                                        </Link>
                                        <div className="home__spotlight__content">
                                            <p>{spotlightProduct.category} / {spotlightProduct.brand}</p>
                                            <h3>{spotlightProduct.name}</h3>
                                            <span>{t("home.spotlightBody")}</span>
                                            <div className="home__spotlight__price">
                                                <strong>{formatCurrency.format(getActivePrice(spotlightProduct))}</strong>
                                                <Link to={`/product?id=${spotlightProduct.id}`}>{t("home.viewProduct")} <ArrowRightIcon size={16} /></Link>
                                            </div>
                                            <button
                                                type="button"
                                                className="home__button home__button--primary home__spotlight__button"
                                                onClick={() => void handleAddingCart(uid || "", spotlightProduct.id)}
                                                disabled={spotlightProduct.stock <= 0}
                                            >
                                                {t("product.addToCart")}
                                            </button>
                                        </div>
                                    </article>
                                ) : null}

                                <div className="home__shelf__products">
                                    {shelfProducts.length > 0 ? (
                                        <div className="home__shelf__grid">
                                            {shelfProducts.map((product) => (
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
                                    ) : (
                                        <div className="home__empty">
                                            <strong>{t("home.emptyTitle")}</strong>
                                            <p>{t("home.emptyBody")}</p>
                                            <Link className="home__text-link" to="/shops">{t("home.viewAllProducts")} <ArrowRightIcon size={17} /></Link>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </section>

                <section className="home__proof" aria-labelledby="home-proof-title">
                    <div className="home__section-frame">
                        <div className="home__proof__heading">
                            <p className="home__section-kicker">{t("home.proofKicker")}</p>
                            <h2 id="home-proof-title">{t("home.proofTitle")}</h2>
                        </div>
                        <div className="home__proof__grid">
                            <article>
                                <strong>{t("home.proofStockTitle")}</strong>
                                <p>{t("home.proofStockBody")}</p>
                            </article>
                            <article>
                                <strong>{t("home.proofCheckoutTitle")}</strong>
                                <p>{t("home.proofCheckoutBody")}</p>
                            </article>
                            <article>
                                <strong>{t("home.proofSupportTitle")}</strong>
                                <p>{t("home.proofSupportBody")}</p>
                            </article>
                        </div>
                    </div>
                </section>

                <RecentlyViewedStrip
                    items={isRecentlyViewedValidated ? recentlyViewed : []}
                    onSelect={(productId) => {
                        const candidate =
                            displayedProducts.find((product) => product.id === productId) ??
                            products.find((product) => product.id === productId) ??
                            recentlyViewed.find((product) => product.id === productId);
                        if (candidate) trackRecentlyViewed(candidate);
                        navigate(`/product?id=${productId}`);
                    }}
                />
            </div>
        </Layout>
    );
};

export default HomePage;
