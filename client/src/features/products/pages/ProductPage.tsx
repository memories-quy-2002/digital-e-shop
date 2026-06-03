import React, { Activity, useActionState, useEffect, useMemo, useOptimistic, useState } from "react";
import { Helmet } from "react-helmet";
import { Link, useLocation } from "react-router-dom";
import {
    StarFillIcon,
    StarIcon,
} from "../../../components/common/Icons";
import Layout from "../../../components/layout/Layout";
import { useAuth } from "../../../context/AuthContext";
import { useToast } from "../../../context/ToastContext";
import productPlaceholder from "../../../assets/images/product_placeholder.jpg";
import NoPage from "../../../pages/NotFoundPage";
import axios from "../../../api/axios";
import "../../../styles/pages/_product.scss";
import { formatUtcDate } from "../../../utils/dateTime";
import { Product } from "../../../utils/interface";
import LazyLoadImage from "../../../utils/LazyLoadingImage";
import {
    PRODUCT_GALLERY_WIDTHS,
    getProductImageUrl,
    getResponsiveImageSource,
    normalizeProductImageName,
} from "../../../utils/images";
import { parseProductDetails } from "../../../utils/productDetails";
import ratingStar from "../../../utils/ratingStar";
import RecommendedProduct from "../components/RecommendedProduct";

type Wishlist = {
    id: number;
    product: Product;
};

type Review = {
    id?: number;
    username: string;
    rating: number;
    reviewText: string;
    created_at: string;
    verified_purchase?: boolean;
};

type ReviewSummary = {
    total: number;
    average: number;
    distribution: Record<1 | 2 | 3 | 4 | 5, number>;
};

type ReviewActionState = {
    status: "idle" | "success" | "error";
    title?: string;
    message?: string;
    reviews?: Review[];
    summary?: ReviewSummary;
    product?: Product;
};

type WishlistMutation = { type: "add"; item: Wishlist } | { type: "remove"; productId: number };

const applyWishlistMutation = (wishlist: Wishlist[], mutation: WishlistMutation): Wishlist[] => {
    if (mutation.type === "remove") {
        return wishlist.filter((item) => item.product.id !== mutation.productId);
    }

    if (wishlist.some((item) => item.product.id === mutation.item.product.id)) {
        return wishlist;
    }

    return [...wishlist, mutation.item];
};

const initialReviewActionState: ReviewActionState = {
    status: "idle",
};

const formatCurrency = (value: number) => `$${Number(value || 0).toFixed(2)}`;

const ProductPage = () => {
    const location = useLocation();
    const url = new URLSearchParams(location.search);
    const { addToast } = useToast();
    const { userData } = useAuth();
    const uid = userData?.id || "";
    const productId = url.get("id");
    const pid = productId !== null ? parseInt(productId) : 0;
    const [productDetail, setProductDetail] = useState<Product>({
        id: 0,
        name: "",
        category: "",
        brand: "",
        price: 0,
        sale_price: 0,
        rating: 0,
        reviews: 0,
        main_image: "",
        stock: 0,
        description: "",
        specifications: "",
    });
    const [relevantProducts, setRelevantProducts] = useState<Product[]>([]);
    const [ratingScore, setRatingScore] = useState<number>(0);
    const [reviewText, setReviewText] = useState<string>("");
    const [reviews, setReviews] = useState<Review[]>([]);
    const [reviewSummary, setReviewSummary] = useState<ReviewSummary>({
        total: 0,
        average: 0,
        distribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
    });
    const [wishlist, setWishlist] = useState<Wishlist[]>([]);
    const [pendingWishlistIds, setPendingWishlistIds] = useState<number[]>([]);
    const [toggle, setToggle] = useState<boolean>(false);
    const [quantity, setQuantity] = useState<number>(1);
    const [activeImage, setActiveImage] = useState<string>("");
    const [optimisticWishlist, applyOptimisticWishlist] = useOptimistic(
        wishlist,
        (currentWishlist: Wishlist[], mutation: WishlistMutation) => applyWishlistMutation(currentWishlist, mutation),
    );
    const [reviewActionState, submitReviewAction, isSubmittingReview] = useActionState(
        async (_previousState: ReviewActionState, formData: FormData): Promise<ReviewActionState> => {
            if (!uid) {
                return {
                    status: "error",
                    title: "Login required",
                    message: "You need to login to use this feature.",
                };
            }

            if (ratingScore === 0) {
                return {
                    status: "error",
                    title: "Invalid rating",
                    message: "The rating score should be from 1 to 5",
                };
            }

            const nextReviewText = String(formData.get("review") ?? "").trim();
            if (!nextReviewText) {
                return {
                    status: "error",
                    title: "Invalid review",
                    message: "Please enter your review before submitting.",
                };
            }

            try {
                const response = await axios.post("/api/reviews/", {
                    uid,
                    pid: productDetail.id,
                    rating: ratingScore,
                    reviewText: nextReviewText,
                    comment: nextReviewText,
                });

                if (response.status !== 200 && response.status !== 201) {
                    throw new Error("Unexpected review response");
                }

                const [reviewsResponse, productResponse] = await Promise.all([
                    axios.get(`/api/reviews/${productDetail.id}`),
                    axios.get(`/api/products/${productDetail.id}`),
                ]);

                return {
                    status: "success",
                    title: "Submit review",
                    message: "Review has been submitted successfully.",
                    reviews:
                        reviewsResponse.status === 200
                            ? normalizeReviews(reviewsResponse.data.reviews || [])
                            : undefined,
                    summary:
                        reviewsResponse.status === 200 ? normalizeSummary(reviewsResponse.data.summary) : undefined,
                    product: productResponse.status === 200 ? productResponse.data.product : undefined,
                };
            } catch {
                return {
                    status: "error",
                    title: "Submit review",
                    message: "Unable to submit review.",
                };
            }
        },
        initialReviewActionState,
    );

    const allImages = useMemo(() => {
        const main = normalizeProductImageName(productDetail.main_image);
        const merged = [main].filter(Boolean);
        return Array.from(new Set(merged));
    }, [productDetail.main_image]);

    const productDetails = useMemo(
        () => parseProductDetails(productDetail.specifications),
        [productDetail.specifications],
    );

    const normalizeReviews = (items: any[] = []): Review[] =>
        items.map((review: any) => ({
            id: review.id,
            username: review.username,
            rating: Number(review.rating) || 0,
            reviewText: review.review_text || review.reviewText || "",
            created_at: review.created_at,
            verified_purchase: Boolean(review.verified_purchase),
        }));

    const normalizeSummary = (summary?: any): ReviewSummary => ({
        total: Number(summary?.total) || 0,
        average: Number(summary?.average) || 0,
        distribution: {
            5: Number(summary?.distribution?.[5]) || 0,
            4: Number(summary?.distribution?.[4]) || 0,
            3: Number(summary?.distribution?.[3]) || 0,
            2: Number(summary?.distribution?.[2]) || 0,
            1: Number(summary?.distribution?.[1]) || 0,
        },
    });

    useEffect(() => {
        const fetchSingleProduct = async () => {
            try {
                const response = await axios.get(`/api/products/${pid}`);
                if (response.status === 200) {
                    setProductDetail(response.data.product);
                }
            } catch {
                addToast("Product", "Unable to load product details.");
            }
        };
        fetchSingleProduct();
    }, [addToast, pid]);

    const wishlistIdSet = useMemo(
        () => new Set(optimisticWishlist.map((item) => item.product.id)),
        [optimisticWishlist],
    );

    useEffect(() => {
        const fetchWishlist = async () => {
            try {
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
            } catch {
                if (uid) {
                    addToast("Wishlist", "Unable to load wishlist.");
                }
            }
        };
        fetchWishlist();
    }, [addToast, uid]);

    useEffect(() => {
        const fetchRelevantProducts = async () => {
            try {
                const response = await axios.get(`/api/products/relevant/${pid}`);
                if (response.status === 200) {
                    setRelevantProducts(response.data.relevantProducts || []);
                }
            } catch {
                addToast("Recommendations", "Unable to load relevant products.");
            }
        };
        fetchRelevantProducts();
    }, [addToast, pid]);

    useEffect(() => {
        const fetchReviews = async () => {
            if (!productDetail.id) return;

            try {
                const response = await axios.get(`/api/reviews/${productDetail.id}`);

                if (response.status === 200) {
                    setReviews(normalizeReviews(response.data.reviews || []));
                    setReviewSummary(normalizeSummary(response.data.summary));
                }
            } catch {
                addToast("Reviews", "Unable to load reviews.");
            }
        };
        fetchReviews();
    }, [addToast, productDetail.id]);

    useEffect(() => {
        if (allImages.length > 0) {
            setActiveImage(allImages[0]);
        }
    }, [allImages]);

    useEffect(() => {
        if (reviewActionState.status === "idle") {
            return;
        }

        addToast(reviewActionState.title || "Review", reviewActionState.message || "Review request finished.");

        if (reviewActionState.status === "success") {
            setReviewText("");
            setRatingScore(0);
            if (reviewActionState.reviews) {
                setReviews(reviewActionState.reviews);
            }
            if (reviewActionState.summary) {
                setReviewSummary(reviewActionState.summary);
            }
            if (reviewActionState.product) {
                setProductDetail(reviewActionState.product);
            }
        }
    }, [addToast, reviewActionState]);

    const handleDecrease = () => {
        setQuantity((value) => Math.max(1, value - 1));
    };

    const handleIncrease = () => {
        if (productDetail.stock > 0) {
            setQuantity((value) => Math.min(productDetail.stock, value + 1));
        }
    };

    const handleStarClick = (rating: number) => {
        setRatingScore(rating);
    };

    const handleAddingCart = async (user_id: string, product: Product) => {
        if (uid === "") {
            addToast("Login required", "You need to login to use this feature.");
            return;
        } else {
            if (productDetail.stock === 0) {
                addToast("Out of stock", "The product is out of stock.");
                return;
            } else if (quantity === 0) {
                addToast("Invalid action", "The quantity should be non-zero to complete the action.");
                return;
            }
        }
        try {
            const response = await axios.post("/api/cart/", {
                uid: user_id,
                pid: product.id,
                quantity: quantity,
            });
            if (response.status === 200) {
                addToast("Add cart item", "Product added to cart successfully.");
            } else if (response.status === 204) {
                addToast("Invalid action", "The product is already in your cart.");
            }
        } catch {
            addToast("Add cart item", "Unable to add item to cart.");
        }
    };

    const toggleWishlist = async (user_id: string, product_id: number) => {
        if (uid === "") {
            addToast("Login required", "You need to login to use this feature.");
            return;
        }
        if (pendingWishlistIds.includes(product_id)) {
            return;
        }

        const exists = wishlistIdSet.has(product_id);
        const optimisticProduct = productDetail.id === product_id ? productDetail : null;
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
                const response = await axios.delete(`/api/wishlist/${product_id}`, {
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
            addToast("Wishlist", "Unable to update wishlist.");
        } finally {
            setPendingWishlistIds((prev) => prev.filter((id) => id !== product_id));
        }
    };

    if (pid <= 0) {
        return <NoPage />;
    }

    const isWishlisted = wishlistIdSet.has(pid);
    const activeImageUrl = activeImage ? getProductImageUrl(activeImage) : "";
    const activeResponsiveImage = activeImageUrl
        ? getResponsiveImageSource(activeImageUrl, {
              widths: PRODUCT_GALLERY_WIDTHS,
              sizes: "(min-width: 1180px) 38vw, (min-width: 860px) 45vw, 92vw",
              fit: "fill",
          })
        : null;
    const placeholderImageSource = getResponsiveImageSource(productPlaceholder, {
        widths: PRODUCT_GALLERY_WIDTHS,
        sizes: "(min-width: 1180px) 38vw, (min-width: 860px) 45vw, 92vw",
        fit: "fill",
    });
    const displayedRating = reviewSummary.total > 0 ? reviewSummary.average : productDetail.rating;
    const displayedReviewCount = reviewSummary.total > 0 ? reviewSummary.total : productDetail.reviews;
    const ratingDistribution = [5, 4, 3, 2, 1] as const;
    const activePrice = productDetail.sale_price || productDetail.price;
    const heroStats = [
        {
            label: "Rating",
            value: `${displayedRating.toFixed(1)} / 5`,
        },
        {
            label: "Price",
            value: formatCurrency(activePrice),
        },
        {
            label: "Stock",
            value: productDetail.stock > 0 ? `${productDetail.stock} available` : "Out of stock",
        },
    ];

    return (
        <Layout>
            <Helmet>
                <title>{productDetail.name ? `${productDetail.name} | Digital-E` : "Product | Digital-E"}</title>
                <meta
                    name="description"
                    content={
                        productDetail.description || "Explore product details, pricing, and availability on Digital-E."
                    }
                />
                {activeResponsiveImage ? (
                    <link rel="preload" as="image" href={activeResponsiveImage.src} fetchPriority="high" />
                ) : null}
            </Helmet>
            <div className="product-page app-page">
                <section className="product-page__hero">
                    <div className="product-page__gallery">
                        <div className="product-page__gallery-meta">
                            <span>Product view</span>
                            <strong>{allImages.length > 1 ? `${allImages.length} gallery images` : "Single product image"}</strong>
                        </div>
                        <div className="product-page__gallery-main">
                            {activeImageUrl ? (
                                <LazyLoadImage
                                    src={activeResponsiveImage?.src || activeImageUrl}
                                    srcSet={activeResponsiveImage?.srcSet}
                                    sizes={activeResponsiveImage?.sizes}
                                    alt={productDetail.name}
                                    eager
                                    fetchPriority="high"
                                    onError={(e) => {
                                        e.currentTarget.src = placeholderImageSource.src;
                                    }}
                                />
                            ) : (
                                <img
                                    src={placeholderImageSource.src}
                                    srcSet={placeholderImageSource.srcSet}
                                    sizes={placeholderImageSource.sizes}
                                    alt={productDetail.name}
                                    loading="lazy"
                                    decoding="async"
                                />
                            )}
                        </div>
                        {allImages.length > 1 ? (
                            <div className="product-page__gallery-thumbs">
                                {allImages.map((img) => {
                                    const src = getProductImageUrl(img);
                                    const responsiveThumb = getResponsiveImageSource(src, {
                                        widths: [160, 240, 320],
                                        sizes: "(min-width: 1180px) 7vw, 22vw",
                                        fit: "fill",
                                    });
                                    return (
                                        <button
                                            key={img}
                                            type="button"
                                            className={img === activeImage ? "active" : ""}
                                            onClick={() => setActiveImage(img)}
                                        >
                                            <img
                                                src={responsiveThumb.src}
                                                srcSet={responsiveThumb.srcSet}
                                                sizes={responsiveThumb.sizes}
                                                alt={productDetail.name}
                                                loading="lazy"
                                                decoding="async"
                                            />
                                        </button>
                                    );
                                })}
                            </div>
                        ) : null}
                    </div>

                    <div className="product-page__summary">
                        <div className="product-page__summary-main">
                            <div className="product-page__summary-header">
                                <div className="product-page__meta">
                                    <span className="product-page__meta-chip">
                                        {productDetail.category || "Catalog item"}
                                    </span>
                                    <span className="product-page__meta-dot"></span>
                                    <span>{productDetail.brand || "Digital-E"}</span>
                                </div>
                                <h1 id="product-hero-title" className="product-page__title">
                                    {productDetail.name}
                                </h1>
                            </div>

                            <div className="product-page__hero-stats" aria-label="Product highlights">
                                {heroStats.map((item) => (
                                    <article key={item.label}>
                                        <span>{item.label}</span>
                                        <strong>{item.value}</strong>
                                    </article>
                                ))}
                            </div>
                        </div>

                        <div className="product-page__purchase-card">
                            <div className="product-page__actions">
                                <label className="product-page__quantity-field" htmlFor="quantity">
                                    <span>Quantity</span>
                                    <div className="product-page__quantity">
                                        <button type="button" onClick={handleDecrease} disabled={productDetail.stock <= 0}>
                                            -
                                        </button>
                                        <input
                                            type="number"
                                            name="quantity"
                                            id="quantity"
                                            min={1}
                                            max={productDetail.stock}
                                            value={quantity}
                                            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                                setQuantity(() => {
                                                    const raw = Number(e.target.value);
                                                    const safe = Number.isFinite(raw) ? raw : 1;
                                                    const max = productDetail.stock > 0 ? productDetail.stock : 1;
                                                    return Math.max(1, Math.min(max, safe));
                                                })
                                            }
                                            disabled={productDetail.stock <= 0}
                                        />
                                        <button type="button" onClick={handleIncrease} disabled={productDetail.stock <= 0}>
                                            +
                                        </button>
                                    </div>
                                    <small>
                                        {productDetail.stock > 0
                                            ? `${productDetail.stock} available now`
                                            : "This item is currently unavailable"}
                                    </small>
                                </label>
                                <button
                                    className="product-page__button product-page__button--primary"
                                    type="button"
                                    onClick={() => {
                                        if (uid) {
                                            handleAddingCart(uid, productDetail);
                                        } else {
                                            addToast("Login required", "You need to login to use this feature.");
                                        }
                                    }}
                                    disabled={productDetail.stock <= 0}
                                >
                                    Add to cart
                                </button>
                                <button
                                    className={`product-page__button product-page__button--secondary${
                                        isWishlisted ? " product-page__button--active" : ""
                                    }`}
                                    type="button"
                                    onClick={() => {
                                        if (uid) {
                                            toggleWishlist(uid, productDetail.id);
                                        } else {
                                            addToast("Login required", "You need to login to use this feature.");
                                        }
                                    }}
                                    disabled={pendingWishlistIds.includes(productDetail.id)}
                                >
                                    {isWishlisted ? "Saved to wishlist" : "Save to wishlist"}
                                </button>
                            </div>
                        </div>
                    </div>
                </section>

                <div className="product-page__tabs">
                    <div className="product-page__tabs-nav">
                        <button
                            type="button"
                            className={`product-page__tab${!toggle ? " product-page__tab--active" : ""}`}
                            onClick={() => setToggle(false)}
                        >
                            Description
                        </button>
                        <button
                            type="button"
                            className={`product-page__tab${toggle ? " product-page__tab--active" : ""}`}
                            onClick={() => setToggle(true)}
                        >
                            Reviews ({reviews.length})
                        </button>
                        <div className="product-page__tabs-line"></div>
                    </div>
                </div>

                <div className="product-page__tab-panels">
                    <Activity mode={toggle ? "hidden" : "visible"}>
                        <div className="product-page__description">
                            <div className="product-page__description-card">
                                <h2>Description</h2>
                                <p>{productDetail.description}</p>
                            </div>
                            <div className="product-page__description-card">
                                <h2>Key details</h2>
                                <div className="product-page__details-grid">
                                    <div>
                                        <span>Brand</span>
                                        <strong>{productDetail.brand || "Not specified"}</strong>
                                    </div>
                                    <div>
                                        <span>Category</span>
                                        <strong>{productDetail.category || "Not specified"}</strong>
                                    </div>
                                    <div>
                                        <span>Model</span>
                                        <strong>{productDetails.model || "Not specified"}</strong>
                                    </div>
                                    <div>
                                        <span>Warranty</span>
                                        <strong>{productDetails.warranty || "12 months"}</strong>
                                    </div>
                                </div>
                                {productDetails.datasheet ? (
                                    <a
                                        className="product-page__datasheet"
                                        href={productDetails.datasheet}
                                        target="_blank"
                                        rel="noreferrer"
                                    >
                                        View datasheet
                                    </a>
                                ) : null}
                            </div>
                            <div className="product-page__description-card product-page__description-card--wide">
                                <h2>Specifications</h2>
                                {productDetails.specifications.length > 0 ? (
                                    <div className="product-page__spec-table">
                                        {productDetails.specifications.map((item, index) => (
                                            <div key={`${item.label}-${index}`}>
                                                <span>{item.label}</span>
                                                <strong>{item.value || "Included"}</strong>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p>No specifications provided yet.</p>
                                )}
                            </div>
                        </div>
                    </Activity>

                    <Activity mode={toggle ? "visible" : "hidden"}>
                        <div className="product-page__reviews">
                            <div className="product-page__reviews-card">
                                <section className="product-page__reviews-summary">
                                    <div className="product-page__reviews-score">
                                        <strong>{displayedRating.toFixed(1)}</strong>
                                        <span>{ratingStar(displayedRating, "#FFCC4A", 20)}</span>
                                        <p>{displayedReviewCount} customer reviews</p>
                                    </div>
                                    <div className="product-page__reviews-bars">
                                        {ratingDistribution.map((star) => {
                                            const count = reviewSummary.distribution[star] || 0;
                                            const percent =
                                                reviewSummary.total > 0 ? (count / reviewSummary.total) * 100 : 0;
                                            return (
                                                <div key={star}>
                                                    <span>{star} stars</span>
                                                    <i>
                                                        <b style={{ width: `${percent}%` }}></b>
                                                    </i>
                                                    <strong>{count}</strong>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </section>

                                {!uid ? (
                                    <div className="product-page__reviews-state">
                                        Login to write a review and rate this product.
                                    </div>
                                ) : (
                                    <form action={submitReviewAction} className="product-page__reviews-form">
                                        <h2>Write a review</h2>
                                        <div className="product-page__reviews-stars">
                                            {[1, 2, 3, 4, 5].map((rating) => (
                                                <button
                                                    key={rating}
                                                    type="button"
                                                    className={
                                                        rating <= ratingScore
                                                            ? "product-page__reviews-star product-page__reviews-star--active"
                                                            : "product-page__reviews-star"
                                                    }
                                                    onClick={() => handleStarClick(rating)}
                                                    aria-label={`Rate ${rating} stars`}
                                                >
                                                    {rating <= ratingScore ? (
                                                        <StarFillIcon size={22} color="#FFCC4A" />
                                                    ) : (
                                                        <StarIcon size={22} data-testid="reviewStar" color="#FFCC4A" />
                                                    )}
                                                </button>
                                            ))}
                                            <span>{ratingScore > 0 ? `${ratingScore}/5` : "Select rating"}</span>
                                        </div>
                                        <textarea
                                            name="review"
                                            id="review"
                                            value={reviewText}
                                            onChange={(event) => setReviewText(event.target.value)}
                                            rows={5}
                                            placeholder="Share what stood out, how you used it, and whether you recommend it."
                                        ></textarea>
                                        {isSubmittingReview ? (
                                            <span className="product-page__reviews-status">
                                                Submitting your review...
                                            </span>
                                        ) : null}
                                        <button type="submit" disabled={isSubmittingReview}>
                                            {isSubmittingReview ? "Submitting..." : "Submit review"}
                                        </button>
                                    </form>
                                )}

                                <section className="product-page__reviews-list">
                                    <div className="product-page__reviews-list-header">
                                        <h2>Customer reviews</h2>
                                        <span>{reviews.length} visible</span>
                                    </div>
                                    {reviews.length > 0 ? (
                                        <div className="product-page__reviews-items">
                                            {reviews.map((review, index) => (
                                                <article
                                                    key={review.id || index}
                                                    className="product-page__reviews-item"
                                                >
                                                    <div className="product-page__reviews-item-header">
                                                        <div>
                                                            <strong>{review.username}</strong>
                                                            {review.verified_purchase ? (
                                                                <span>Verified purchase</span>
                                                            ) : null}
                                                        </div>
                                                        <small>{formatUtcDate(review.created_at)}</small>
                                                    </div>
                                                    <div className="product-page__reviews-item-stars">
                                                        {ratingStar(review.rating, "#FFCC4A", 18)}
                                                    </div>
                                                    <p>{review.reviewText}</p>
                                                </article>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="product-page__reviews-state">
                                            No reviews yet. Be the first to rate this product.
                                        </div>
                                    )}
                                </section>
                            </div>
                        </div>
                    </Activity>
                </div>

                <section className="product-page__recommendations-shell">
                    <div className="product-page__recommendations-head">
                        <h2 className="product-page__recommendations-title">Recommended products</h2>
                        <Link to="/shops" className="product-page__recommendations-link">
                            Browse catalog
                        </Link>
                    </div>
                    <RecommendedProduct relevantProducts={relevantProducts} />
                </section>
            </div>
        </Layout>
    );
};

export default ProductPage;
