import { useEffect, useState } from "react";
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
    const { uid } = useAuth();
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
    const [quantity, setQuantity] = useState<number>(0);

    useEffect(() => {
        const fetchSingleProduct = async () => {
            try {
                const response = await axios.get(`/api/products/${pid}`);
                if (response.status === 200) {
                    setProductDetail(response.data.product);
                    // setQuantity(response.data.product.stock); // Cập nhật số lượng
                    console.log(response.data.msg);
                }
            } catch (err: any) {
                console.error(err);
            }
        };
        fetchSingleProduct();
        // Clean up the Blob URL after component unmount
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

    const handleDecrease = () => setQuantity((quantity) => quantity - 1);
    const handleIncrease = () => setQuantity((quantity) => quantity + 1);
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
                console.log(response.data.msg);
                addToast("Add cart item", "Product added to cart successfully.");
            }
        } catch (err) {
            throw err;
        }
    };

    const handleAddingWishlist = async (user_id: string, product_id: number) => {
        if (uid === "") {
            addToast("Login required", "You need to login to use this feature.");
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
        } catch (err) {
            console.error(err);
        }
    };

    const handleSubmitReview = async (uid: string, pid: number, rating: number, reviewText: string) => {
        if (ratingScore === 0) {
            addToast("Invalid rating", "The rating score should be from 1 to 5");
            return;
        }
        try {
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
        } catch (err) {
            throw err;
        }
    };

    if (pid <= 0) {
        return <NoPage />;
    }
    return (
        <Layout>
            <NavigationBar />
            <Helmet>
                <title>{productDetail.name}</title>
            </Helmet>
            <div className="product__container">
                <div className="product__container__detail">
                    <div className="product__container__detail__img">
                        {productDetail.main_image ? (
                            <img
                                src={`https://epgq6ejr4lgv8lec.public.blob.vercel-storage.com/uploads/${productDetail.main_image}.jpg`}
                                alt={productDetail.name}
                            />
                        ) : (
                            <img
                                src={require("../../assets/images/product_placeholder.jpg")}
                                alt={productDetail.name}
                            />
                        )}
                    </div>
                    <div className="product__container__detail__main">
                        <div className="product__container__detail__main__info">
                            <div className="product__container__detail__main__info__rating">
                                <div
                                    style={{
                                        display: "flex",
                                        flexDirection: "row",
                                        gap: "0.25rem",
                                    }}
                                >
                                    {ratingStar(productDetail.rating, "#FFCC4A", 24)}
                                </div>
                                <span
                                    style={{
                                        fontSize: "1.5rem",
                                    }}
                                >
                                    {productDetail.rating} ({productDetail.reviews})
                                </span>
                            </div>
                            <strong className="product__container__detail__main__info__name">
                                {productDetail.name}
                            </strong>

                            <div className="product__container__detail__main__info__price">
                                {productDetail.sale_price ? (
                                    <>
                                        <span className="product__container__detail__main__info__price-active">
                                            ${productDetail.sale_price}
                                        </span>{" "}
                                        <span className="product__container__detail__main__info__price-original">
                                            ${productDetail.price}
                                        </span>
                                    </>
                                ) : (
                                    <span className="product__container__detail__main__info__price-active">
                                        ${productDetail.price}
                                    </span>
                                )}
                            </div>
                            <div className="product__container__detail__main__info__other">
                                <span>Category: {productDetail.category}</span>
                                <span>Brand: {productDetail.brand}</span>
                                <span>
                                    Status:{" "}
                                    <span
                                        style={{
                                            color: "red",
                                            fontWeight: "bold",
                                        }}
                                    >
                                        {" "}
                                        {productDetail.stock > 0 ? "In stock" : "Out of stock"}
                                    </span>
                                </span>
                            </div>
                        </div>
                        <div className="product__container__detail__main__quantity">
                            <strong className="product__container__detail__main__quantity__title">Quantity</strong>
                            <div className="product__container__detail__main__quantity__input">
                                <button
                                    className="product__container__detail__main__quantity__input-minus"
                                    type="button"
                                    onClick={handleDecrease}
                                >
                                    -
                                </button>
                                <input
                                    type="number"
                                    name="quantity"
                                    id="quantity"
                                    value={quantity}
                                    onChange={(e: any) =>
                                        setProductDetail((detail) => {
                                            return {
                                                ...detail,
                                                stock: Number(e.target.value),
                                            };
                                        })
                                    }
                                />
                                <button
                                    className="product__container__detail__main__quantity__input-plus"
                                    type="button"
                                    onClick={handleIncrease}
                                >
                                    +
                                </button>
                            </div>
                        </div>
                        <div className="product__container__detail__main__button">
                            <button
                                className="product__container__detail__main__button-cart"
                                type="button"
                                onClick={() => {
                                    if (uid) {
                                        handleAddingCart(uid, productDetail);
                                    } else {
                                        addToast("Login required", "You need to login to use this feature.");
                                    }
                                }}
                            >
                                Add to cart
                            </button>
                            <button
                                className="product__container__detail__main__button-wishlist"
                                type="button"
                                onClick={() => {
                                    if (uid) {
                                        handleAddingWishlist(uid, productDetail.id);
                                    } else {
                                        addToast("Login required", "You need to login to use this feature.");
                                    }
                                }}
                            >
                                {wishlist.some((item) => item.product.id === pid)
                                    ? "Remove from wishlist"
                                    : "Add to wishlist"}
                            </button>
                        </div>
                    </div>
                </div>
                <div className="product__container__navigation">
                    <div className="product__container__navigation__btn">
                        <button type="button" className={!toggle ? "active" : ""} onClick={() => setToggle(false)}>
                            Description
                        </button>
                        <button type="button" className={toggle ? "active" : ""} onClick={() => setToggle(true)}>
                            Review ({reviews.length})
                        </button>
                        <div className="product__container__navigation__btn__empty"></div>
                    </div>
                </div>
                {toggle ? (
                    <div className="product__container__review">
                        {!uid ? (
                            <div className="product__container__review__container">
                                You need to login to use this feature
                            </div>
                        ) : (
                            <div className="product__container__review__container">
                                <div className="product__container__review__container__rating">
                                    <h5 className="product__container__review__container__rating__title">Rating</h5>
                                    <div className="product__container__review__container__rating__container">
                                        <div className="product__container__review__container__rating__container__star">
                                            {[1, 2, 3, 4, 5].map((rating) => (
                                                <span key={rating} onClick={() => handleStarClick(rating)}>
                                                    {rating <= ratingScore ? (
                                                        <BsStarFill size={18} color="#FFCC4A" />
                                                    ) : (
                                                        <BsStar size={18} color="#FFCC4A" />
                                                    )}
                                                </span>
                                            ))}
                                        </div>
                                        <div className="product__container__review__container__rating__container__score">
                                            <span>({ratingScore.toFixed(0)})</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="product__container__review__container__text">
                                    <h5 className="product__container__review__container__text__title">Review</h5>
                                    <textarea
                                        className="product__container__review__container__text__area"
                                        name="review"
                                        id="review"
                                        value={reviewText}
                                        onChange={(event) => setReviewText(event.target.value)}
                                        rows={10}
                                        placeholder="Enter your review"
                                    ></textarea>
                                    <button
                                        className="product__container__review__container__text__button"
                                        type="submit"
                                        onClick={() =>
                                            handleSubmitReview(uid, productDetail.id, ratingScore, reviewText)
                                        }
                                    >
                                        Submit
                                    </button>
                                </div>
                                <div className="product__container__review__container__all">
                                    <h5 className="product__container__review__container__all__title">
                                        All reviews ({reviews.length})
                                    </h5>
                                    <div className="product__container__review__container__all__list">
                                        {reviews.map((review) => (
                                            <div className="product__container__review__container__all__list__item">
                                                <div className="product__container__review__container__all__list__item__info">
                                                    <strong>{review.username}</strong>
                                                    <span className="product__container__review__container__all__list__item__info__star">
                                                        {ratingStar(review.rating, "#FFCC4A", 18)}
                                                    </span>
                                                    <span>
                                                        {new Date(review.created_at).toLocaleDateString("en-GB")}
                                                    </span>
                                                </div>
                                                <div className="product__container__review__container__all__list__item__review">
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
                    <div className="product__container__description">
                        <h5>Description</h5>
                        <p>
                            Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut
                            labore et dolore magna aliqua. Morbi tincidunt augue interdum velit euismod in pellentesque.
                            Nunc sed id semper risus in hendrerit gravida. Diam vel quam elementum pulvinar etiam non
                            quam lacus. Amet massa vitae tortor condimentum lacinia quis vel eros donec. Donec massa
                            sapien faucibus et. Dui ut ornare lectus sit. Quam pellentesque nec nam aliquam sem.
                            Ultricies integer quis auctor elit. Penatibus et magnis dis parturient montes nascetur
                            ridiculus mus mauris. Euismod in pellentesque massa placerat duis ultricies. Donec enim diam
                            vulputate ut pharetra sit amet. At tempor commodo ullamcorper a lacus vestibulum. Risus
                            pretium quam vulputate dignissim. Tincidunt tortor aliquam nulla facilisi cras. Accumsan
                            tortor posuere ac ut consequat semper viverra nam. Dictum sit amet justo donec. Ultricies
                            lacus sed turpis tincidunt id aliquet risus.
                            {productDetail.description}
                        </p>
                    </div>
                )}

                <RecommendedProduct pid={productDetail.id} relevantProducts={relevantProducts} />
            </div>
        </Layout>
    );
};

export default ProductPage;
