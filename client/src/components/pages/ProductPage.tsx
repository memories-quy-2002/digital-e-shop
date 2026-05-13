import React, { useEffect, useMemo, useState } from "react";
import { StarIcon, StarFillIcon } from "../common/Icons";
import axios from "../../api/axios";
import { useToast } from "../../context/ToastContext";
import "../../styles/ProductPage.scss";
import { Product } from "../../utils/interface";
import ratingStar from "../../utils/ratingStar";
import RecommendedProduct from "../common/RecommendedProduct";
import Layout from "../layout/Layout";
import NoPage from "./NoPage";
import { useAuth } from "../../context/AuthContext";
import { Helmet } from "react-helmet";
import { useLocation } from "react-router-dom";
import LazyLoadImage from "../../utils/LazyLoadingImage";
import productPlaceholder from "../../assets/images/product_placeholder.jpg";
import { parseProductDetails } from "../../utils/productDetails";
import { formatUtcDate } from "../../utils/dateTime";

interface relevantProductsItem {
    product_id: number;
    product_name: string;
}

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

const ProductPage = () => {
    const location = useLocation();
    const url = new URLSearchParams(location.search);
    const { addToast } = useToast();
    const { userData } = useAuth();
    const uid = userData?.id || "";
    const productId = url.get("id");
    const pid = productId !== null ? parseInt(productId) : 0;
    const [products, setProducts] = useState<Product[]>([]);
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
    const [toggle, setToggle] = useState<boolean>(false);
    const [quantity, setQuantity] = useState<number>(1);
    const [activeImage, setActiveImage] = useState<string>("");

    const normalizeImage = (name?: string | null) => {
        if (!name) return "";
        return name.replace(/\.jpg$/i, "");
    };

    const imageBase = "https://2txtqipejre57csy.public.blob.vercel-storage.com/uploads/";

    const allImages = useMemo(() => {
        const main = normalizeImage(productDetail.main_image);
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
            } catch (err) {
                addToast("Product", "Unable to load product details.");
            }
        };
        fetchSingleProduct();
        return () => {};
    }, [pid]);

    useEffect(() => {
        const fetchAllProducts = async () => {
            try {
                const response = await axios.get("/api/products?page=1&limit=60");
                if (response.status === 200) {
                    setProducts(response.data.products);
                }
            } catch (err) {
                addToast("Products", "Unable to load products.");
            }
        };
        fetchAllProducts();
        return () => {};
    }, []);

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
            } catch (err) {
                if (uid) {
                    addToast("Wishlist", "Unable to load wishlist.");
                }
            }
        };
        fetchWishlist();
        return () => {};
    }, [uid]);

    useEffect(() => {
        const fetchRelevantProducts = async () => {
            try {
                const response = await axios.get(`/api/products/relevant/${pid}`);
                if (response.status === 200) {
                    if (response.data.relevantProducts.length === 0) {
                        setRelevantProducts(products);
                        return;
                    }
                    const newRelevantProducts: relevantProductsItem[] = response.data.relevantProducts;
                    const relevantProductsIds: number[] = newRelevantProducts.map((product) => product.product_id);

                    setRelevantProducts(
                        products
                            .filter((product) => relevantProductsIds.includes(product.id))
                            .sort((a, b) => {
                                const indexA = relevantProductsIds.indexOf(a.id);
                                const indexB = relevantProductsIds.indexOf(b.id);
                                return indexA - indexB;
                            }),
                    );
                }
            } catch (err) {
                addToast("Recommendations", "Unable to load relevant products.");
            }
        };
        fetchRelevantProducts();

        return () => {};
    }, [products, pid]);

    useEffect(() => {
        const fetchReviews = async () => {
            if (!productDetail.id) return;

            try {
                const response = await axios.get(`/api/reviews/${productDetail.id}`);

                if (response.status === 200) {
                    setReviews(normalizeReviews(response.data.reviews || []));
                    setReviewSummary(normalizeSummary(response.data.summary));
                }
            } catch (err) {
                addToast("Reviews", "Unable to load reviews.");
            }
        };
        fetchReviews();
        return () => {};
    }, [productDetail.id]);

    useEffect(() => {
        if (allImages.length > 0) {
            setActiveImage(allImages[0]);
        }
    }, [allImages]);

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
        } catch (err) {
            addToast("Add cart item", "Unable to add item to cart.");
        }
    };

    const toggleWishlist = async (user_id: string, product_id: number) => {
        if (uid === "") {
            addToast("Login required", "You need to login to use this feature.");
            return;
        }
        try {
            const exists = wishlist.some((item) => item.product.id === product_id);
            if (exists) {
                const response = await axios.delete(`/api/wishlist/${product_id}`, {
                    data: {
                        uid: user_id,
                    },
                });
                if (response.status === 200) {
                    setWishlist((list) => list.filter((item) => item.product.id !== product_id));
                    addToast("Remove wishlist item", "Item removed from wishlist successfully");
                }
            } else {
                const response = await axios.post("/api/wishlist/", {
                    uid: user_id,
                    pid: product_id,
                });
                if (response.status === 200) {
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
        } catch (err) {
            addToast("Wishlist", "Unable to update wishlist.");
        }
    };

    const handleSubmitReview = async (uid: string, pid: number, rating: number, reviewText: string) => {
        if (!uid) {
            addToast("Login required", "You need to login to use this feature.");
            return;
        }
        if (rating === 0) {
            addToast("Invalid rating", "The rating score should be from 1 to 5");
            return;
        }
        if (!reviewText.trim()) {
            addToast("Invalid review", "Please enter your review before submitting.");
            return;
        }

        try {
            const response = await axios.post("/api/reviews/", {
                uid,
                pid,
                rating,
                reviewText,
                comment: reviewText,
            });

            if (response.status === 200 || response.status === 201) {
                addToast("Submit review", "Review has been submitted successfully.");
                setReviewText("");
                setRatingScore(0);

                const [reviewsResponse, productResponse] = await Promise.all([
                    axios.get(`/api/reviews/${pid}`),
                    axios.get(`/api/products/${pid}`),
                ]);

                if (reviewsResponse.status === 200) {
                    setReviews(normalizeReviews(reviewsResponse.data.reviews || []));
                    setReviewSummary(normalizeSummary(reviewsResponse.data.summary));
                }

                if (productResponse.status === 200) {
                    setProductDetail(productResponse.data.product);
                }
            }
        } catch (err) {
            addToast("Submit review", "Unable to submit review.");
        }
    };

    if (pid <= 0) {
        return <NoPage />;
    }

    const isWishlisted = wishlist.length > 0 && wishlist.some((item) => item.product.id === pid);
    const activeImageUrl = activeImage ? `${imageBase}${activeImage}.jpg` : "";
    const displayedRating = reviewSummary.total > 0 ? reviewSummary.average : productDetail.rating;
    const displayedReviewCount = reviewSummary.total > 0 ? reviewSummary.total : productDetail.reviews;
    const ratingDistribution = [5, 4, 3, 2, 1] as const;

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
                {activeImageUrl ? <link rel="preload" as="image" href={activeImageUrl} fetchPriority="high" /> : null}
            </Helmet>
            <div className="product__container">
                <section className="product__hero">
                    <div className="product__hero__gallery">
                        <div className="product__hero__gallery__main">
                            {activeImageUrl ? (
                                <LazyLoadImage
                                    src={activeImageUrl}
                                    alt={productDetail.name}
                                    eager
                                    onError={(e) => {
                                        e.currentTarget.src = productPlaceholder;
                                    }}
                                />
                            ) : (
                                <img src={productPlaceholder} alt={productDetail.name} />
                            )}
                        </div>
                        {allImages.length > 1 ? (
                            <div className="product__hero__gallery__thumbs">
                                {allImages.map((img) => {
                                    const src = `${imageBase}${img}.jpg`;
                                    return (
                                        <button
                                            key={img}
                                            type="button"
                                            className={img === activeImage ? "active" : ""}
                                            onClick={() => setActiveImage(img)}
                                        >
                                            <img src={src} alt={productDetail.name} loading="lazy" decoding="async" />
                                        </button>
                                    );
                                })}
                            </div>
                        ) : null}
                    </div>

                    <div className="product__hero__summary">
                        <div className="product__hero__summary__meta">
                            <span>{productDetail.category}</span>
                            <span className="dot"></span>
                            <span>{productDetail.brand}</span>
                        </div>
                        <h1 className="product__hero__summary__title">{productDetail.name}</h1>
                        <div className="product__hero__summary__rating">
                            <div className="product__hero__summary__rating__stars">
                                {ratingStar(displayedRating, "#FFCC4A", 22)}
                            </div>
                            <span>
                                {displayedRating.toFixed(1)} ({displayedReviewCount} reviews)
                            </span>
                        </div>
                        <div className="product__hero__summary__price">
                            {productDetail.sale_price ? (
                                <>
                                    <span className="price-active price-active--sale">${productDetail.sale_price}</span>
                                    <span className="price-original">${productDetail.price}</span>
                                </>
                            ) : (
                                <span className="price-active">${productDetail.price}</span>
                            )}
                        </div>
                        <div className="product__hero__summary__stock">
                            {productDetail.stock > 0 ? (
                                <span className="in">In stock</span>
                            ) : (
                                <span className="out">Out of stock</span>
                            )}
                        </div>

                        <div className="product__hero__summary__actions">
                            <div className="quantity">
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
                            <button
                                className="primary"
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
                                className={isWishlisted ? "secondary active" : "secondary"}
                                type="button"
                                onClick={() => {
                                    if (uid) {
                                        toggleWishlist(uid, productDetail.id);
                                    } else {
                                        addToast("Login required", "You need to login to use this feature.");
                                    }
                                }}
                            >
                                {isWishlisted ? "Remove from wishlist" : "Add to wishlist"}
                            </button>
                        </div>

                        <div className="product__hero__summary__highlights">
                            <div>
                                <strong>{productDetails.model || "Ready to ship"}</strong>
                                <span>{productDetail.brand || "Digital-E catalog"}</span>
                            </div>
                            <div>
                                <strong>Warranty</strong>
                                <span>{productDetails.warranty || "12 months included"}</span>
                            </div>
                            <div>
                                <strong>Stock</strong>
                                <span>{productDetail.stock > 0 ? `${productDetail.stock} available` : "Restock required"}</span>
                            </div>
                        </div>
                    </div>
                </section>

                <div className="product__tabs">
                    <div className="product__tabs__buttons">
                        <button type="button" className={!toggle ? "active" : ""} onClick={() => setToggle(false)}>
                            Description
                        </button>
                        <button type="button" className={toggle ? "active" : ""} onClick={() => setToggle(true)}>
                            Reviews ({reviews.length})
                        </button>
                        <div className="product__tabs__buttons__line"></div>
                    </div>
                </div>

                {toggle ? (
                    <div className="product__review">
                        <div className="product__review__container">
                            <section className="product__review__summary">
                                <div className="product__review__summary__score">
                                    <strong>{displayedRating.toFixed(1)}</strong>
                                    <span>{ratingStar(displayedRating, "#FFCC4A", 20)}</span>
                                    <p>{displayedReviewCount} customer reviews</p>
                                </div>
                                <div className="product__review__summary__bars">
                                    {ratingDistribution.map((star) => {
                                        const count = reviewSummary.distribution[star] || 0;
                                        const percent = reviewSummary.total > 0 ? (count / reviewSummary.total) * 100 : 0;
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
                                <div className="product__review__login">Login to write a review and rate this product.</div>
                            ) : (
                                <section className="product__review__form">
                                    <div>
                                        <h2>Write a review</h2>
                                        <p>Your latest review for this product will update your previous rating.</p>
                                    </div>
                                    <div className="product__review__form__stars">
                                        {[1, 2, 3, 4, 5].map((rating) => (
                                            <button
                                                key={rating}
                                                type="button"
                                                className={rating <= ratingScore ? "active" : ""}
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
                                    <button
                                        type="button"
                                        onClick={() => handleSubmitReview(uid, productDetail.id, ratingScore, reviewText)}
                                    >
                                        Submit review
                                    </button>
                                </section>
                            )}

                            <section className="product__review__list">
                                <div className="product__review__list__header">
                                    <h2>Customer reviews</h2>
                                    <span>{reviews.length} visible</span>
                                </div>
                                {reviews.length > 0 ? (
                                    <div className="product__review__list__items">
                                        {reviews.map((review, index) => (
                                            <article key={review.id || index} className="product__review__item">
                                                <div className="product__review__item__header">
                                                    <div>
                                                        <strong>{review.username}</strong>
                                                        {review.verified_purchase ? <span>Verified purchase</span> : null}
                                                    </div>
                                                    <small>{formatUtcDate(review.created_at)}</small>
                                                </div>
                                                <div className="product__review__item__stars">
                                                    {ratingStar(review.rating, "#FFCC4A", 18)}
                                                </div>
                                                <p>{review.reviewText}</p>
                                            </article>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="product__review__empty">No reviews yet. Be the first to rate this product.</div>
                                )}
                            </section>
                        </div>
                    </div>
                ) : (
                    <div className="product__description">
                        <div className="product__description__card">
                            <h2>Description</h2>
                            <p>{productDetail.description}</p>
                        </div>
                        <div className="product__description__card">
                            <h2>Key details</h2>
                            <div className="product__details-grid">
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
                                    className="product__datasheet"
                                    href={productDetails.datasheet}
                                    target="_blank"
                                    rel="noreferrer"
                                >
                                    View datasheet
                                </a>
                            ) : null}
                        </div>
                        <div className="product__description__card">
                            <h2>Highlights</h2>
                            {productDetails.highlights.length > 0 ? (
                                <ul className="product__feature-list">
                                    {productDetails.highlights.map((item, index) => (
                                        <li key={index}>{item}</li>
                                    ))}
                                </ul>
                            ) : (
                                <p>Reliable quality, checked stock, and support from Digital-E.</p>
                            )}
                        </div>
                        <div className="product__description__card product__description__card--table">
                            <h2>Specifications</h2>
                            {productDetails.specifications.length > 0 ? (
                                <div className="product__spec-table">
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
                )}

                <RecommendedProduct pid={productDetail.id} relevantProducts={relevantProducts} />
            </div>
        </Layout>
    );
};

export default ProductPage;
