import React, { useEffect, useMemo, useState } from "react";
import { BsStar, BsStarFill } from "react-icons/bs";
import axios from "../../api/axios";
import { useToast } from "../../context/ToastContext";
import "../../styles/ProductPage.scss";
import { Product } from "../../utils/interface";
import ratingStar from "../../utils/ratingStar";
import NavigationBar from "../common/NavigationBar";
import RecommendedProduct from "../common/RecommendedProduct";
import Layout from "../layout/Layout";
import NoPage from "./NoPage";
import { useAuth } from "../../context/AuthContext";
import { Helmet } from "react-helmet";
import { useLocation } from "react-router-dom";
import LazyLoadImage from "../../utils/LazyLoadingImage";
import productPlaceholder from "../../assets/images/product_placeholder.jpg";

interface relevantProductsItem {
    product_id: number;
    product_name: string;
}

type Wishlist = {
    id: number;
    product: Product;
};

type Review = {
    username: string;
    rating: number;
    reviewText: string;
    created_at: Date;
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
        image_gallery: [],
        stock: 0,
        description: "",
        specifications: [],
    });
    const [relevantProducts, setRelevantProducts] = useState<Product[]>([]);
    const [ratingScore, setRatingScore] = useState<number>(0);
    const [reviewText, setReviewText] = useState<string>("");
    const [reviews, setReviews] = useState<Review[]>([]);
    const [wishlist, setWishlist] = useState<Wishlist[]>([]);
    const [toggle, setToggle] = useState<boolean>(false);
    const [quantity, setQuantity] = useState<number>(1);
    const [activeImage, setActiveImage] = useState<string>("");

    const normalizeImage = (name?: string | null) => {
        if (!name) return "";
        return name.replace(/\.jpg$/i, "");
    };

    const imageBase = "https://epgq6ejr4lgv8lec.public.blob.vercel-storage.com/uploads/";

    const galleryImages = useMemo(() => {
        if (Array.isArray(productDetail.image_gallery)) {
            return productDetail.image_gallery as string[];
        }
        return [] as string[];
    }, [productDetail.image_gallery]);

    const allImages = useMemo(() => {
        const main = normalizeImage(productDetail.main_image);
        const others = galleryImages.map((img) => normalizeImage(img)).filter(Boolean);
        const merged = [main, ...others].filter(Boolean);
        return Array.from(new Set(merged));
    }, [galleryImages, productDetail.main_image]);

    const specs = useMemo(() => {
        if (Array.isArray(productDetail.specifications)) {
            return productDetail.specifications as string[];
        }
        if (typeof productDetail.specifications === "string") {
            const trimmed = productDetail.specifications.trim();
            if (trimmed.startsWith("[")) {
                try {
                    const parsed = JSON.parse(trimmed);
                    if (Array.isArray(parsed)) {
                        return parsed.map(String);
                    }
                } catch {
                    return [] as string[];
                }
            }
            return trimmed ? [trimmed] : [];
        }
        return [] as string[];
    }, [productDetail.specifications]);

    useEffect(() => {
        const fetchSingleProduct = async () => {
            try {
                const response = await axios.get(`/api/products/${pid}`);
                if (response.status === 200) {
                    setProductDetail(response.data.product);
                    console.log(response.data.msg);
                }
            } catch (err) {
                console.error(err);
            }
        };
        fetchSingleProduct();
        return () => {};
    }, [pid]);

    useEffect(() => {
        const fetchAllProducts = async () => {
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
        fetchAllProducts();
        return () => {};
    }, []);

    useEffect(() => {
        const fetchWishlist = async () => {
            try {
                const response = await axios.get(`/api/wishlist/${uid}`);
                console.log(response);

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
            } catch (err) {
                console.error(err);
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
                            })
                    );
                    console.log(response.data.msg);
                }
            } catch (err) {
                console.error(err);
            }
        };
        fetchRelevantProducts();

        return () => {};
    }, [products, pid]);

    useEffect(() => {
        const fetchReviews = async () => {
            try {
                const response = await axios.get(`/api/reviews/${productDetail.id}`);
                console.log(response);

                if (response.status === 200) {
                    setReviews(
                        response.data.reviews.map((review: any) => {
                            return {
                                username: review.username,
                                rating: review.rating,
                                reviewText: review.review_text,
                                created_at: review.created_at,
                            };
                        })
                    );
                    console.log(response.data.msg);
                }
            } catch (err) {
                console.error(err);
            }
        };
        fetchReviews();
        return () => {};
    }, [productDetail]);

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
        const response = await axios.post("/api/cart/", {
            uid: user_id,
            pid: product.id,
            quantity: quantity,
        });
        if (response.status === 200) {
            console.log(response.data.msg);
            addToast("Add cart item", "Product added to cart successfully.");
        } else if (response.status === 204) {
            addToast("Invalid action", "The product is already in your cart.");
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
                    const newProduct = products.filter((product) => product.id === product_id)[0];
                    setWishlist((list) => [
                        ...list,
                        {
                            id: product_id,
                            product: newProduct,
                        },
                    ]);
                    console.log(response.data.msg);
                    addToast("Add wishlist item", "Item added to wishlist successfully");
                }
            }
        } catch (err) {
            console.error(err);
        }
    };

    const handleSubmitReview = async (uid: string, pid: number, rating: number, reviewText: string) => {
        if (ratingScore === 0) {
            addToast("Invalid rating", "The rating score should be from 1 to 5");
            return;
        }

        const response = await axios.post("/api/reviews/", {
            uid,
            pid,
            rating,
            reviewText,
        });

        if (response.status === 200) {
            console.log(response.data.msg);
            addToast("Submit review", "Review has been submitted successfully.");
            window.location.reload();
        }
    };

    useEffect(() => {
        console.log(reviews);
    }, [reviews]);

    if (pid <= 0) {
        return <NoPage />;
    }

    const isWishlisted = wishlist.length > 0 && wishlist.some((item) => item.product.id === pid);
    const activeImageUrl = activeImage ? `${imageBase}${activeImage}.jpg` : "";

    return (
        <Layout>
            <NavigationBar />
            <Helmet>
                <title>{productDetail.name}</title>
                <meta name="description" content={productDetail.description} />
            </Helmet>
            <div className="product__container">
                <section className="product__hero">
                    <div className="product__hero__gallery">
                        <div className="product__hero__gallery__main">
                            {activeImageUrl ? (
                                <LazyLoadImage src={activeImageUrl} alt={productDetail.name} />
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
                                            <img src={src} alt={productDetail.name} />
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
                                {ratingStar(productDetail.rating, "#FFCC4A", 22)}
                            </div>
                            <span>
                                {productDetail.rating} ({productDetail.reviews} reviews)
                            </span>
                        </div>
                        <div className="product__hero__summary__price">
                            {productDetail.sale_price ? (
                                <>
                                    <span className="price-active">${productDetail.sale_price}</span>
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
                                <strong>Free delivery</strong>
                                <span>Orders over $50</span>
                            </div>
                            <div>
                                <strong>Warranty</strong>
                                <span>12 months included</span>
                            </div>
                            <div>
                                <strong>Support</strong>
                                <span>24/7 email support</span>
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
                        {!uid ? (
                            <div className="product__review__container">
                                You need to login to use this feature
                            </div>
                        ) : (
                            <div className="product__review__container">
                                <div className="product__review__container__rating">
                                    <h5 className="product__review__container__rating__title">Rating</h5>
                                    <div className="product__review__container__rating__container">
                                        <div className="product__review__container__rating__container__star">
                                            {[1, 2, 3, 4, 5].map((rating) => (
                                                <span key={rating} onClick={() => handleStarClick(rating)}>
                                                    {rating <= ratingScore ? (
                                                        <BsStarFill size={18} color="#FFCC4A" />
                                                    ) : (
                                                        <BsStar size={18} data-testid="reviewStar" color="#FFCC4A" />
                                                    )}
                                                </span>
                                            ))}
                                        </div>
                                        <div className="product__review__container__rating__container__score">
                                            <span>({ratingScore.toFixed(0)})</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="product__review__container__text">
                                    <h5 className="product__review__container__text__title">Review</h5>
                                    <textarea
                                        className="product__review__container__text__area"
                                        name="review"
                                        id="review"
                                        value={reviewText}
                                        onChange={(event) => setReviewText(event.target.value)}
                                        rows={10}
                                        placeholder="Enter your review"
                                    ></textarea>
                                    <button
                                        className="product__review__container__text__button"
                                        type="submit"
                                        onClick={() => handleSubmitReview(uid, productDetail.id, ratingScore, reviewText)}
                                    >
                                        Submit
                                    </button>
                                </div>
                                <div className="product__review__container__all">
                                    <h5 className="product__review__container__all__title">
                                        All reviews ({reviews.length})
                                    </h5>
                                    <div className="product__review__container__all__list">
                                        {reviews.map((review, index) => (
                                            <div key={index} className="product__review__container__all__list__item">
                                                <div className="product__review__container__all__list__item__info">
                                                    <strong>{review.username}</strong>
                                                    <span className="product__review__container__all__list__item__info__star">
                                                        {ratingStar(review.rating, "#FFCC4A", 18)}
                                                    </span>
                                                    <span>
                                                        {new Date(review.created_at).toLocaleDateString("en-GB")}
                                                    </span>
                                                </div>
                                                <div className="product__review__container__all__list__item__review">
                                                    <p>{review.reviewText}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="product__description">
                        <div className="product__description__card">
                            <h5>Description</h5>
                            <p>{productDetail.description}</p>
                        </div>
                        <div className="product__description__card">
                            <h5>Specifications</h5>
                            {specs.length > 0 ? (
                                <ul>
                                    {specs.map((item, index) => (
                                        <li key={index}>{item}</li>
                                    ))}
                                </ul>
                            ) : (
                                <p>No specifications provided.</p>
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
