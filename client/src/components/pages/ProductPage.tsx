import { useEffect, useState } from "react";
import { BsStar, BsStarFill } from "react-icons/bs";
import Cookies from "universal-cookie";
import axios from "../../api/axios";
import { useToast } from "../../context/ToastContext";
import "../../styles/ProductPage.scss";
import { Product } from "../../utils/interface";
import ratingStar from "../../utils/ratingStar";
import NavigationBar from "../common/NavigationBar";
import RecommendedProduct from "../common/RecommendedProduct";
import Layout from "../layout/Layout";
import NoPage from "./NoPage";

const cookies = new Cookies();
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
    const url = new URLSearchParams(window.location.search);
    const { addToast } = useToast();
    const productId = url.get("id");
    const uid =
        cookies.get("rememberMe")?.uid ||
        (sessionStorage["rememberMe"]
            ? JSON.parse(sessionStorage["rememberMe"]).uid
            : "");

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
                    console.log(response.data.msg);
                }
            } catch (err: any) {
                console.error(err);
            }
        };
        fetchSingleProduct();
        setQuantity(productDetail.stock);
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
        const fetchRelevantProducts = async () => {
            try {
                const response = await axios.get(
                    `/api/products/relevant/${pid}`
                );
                if (response.status === 200) {
                    if (response.data.relevantProducts.length === 0) {
                        setRelevantProducts(products);
                        return;
                    }
                    const newRelevantProducts: relevantProductsItem[] =
                        response.data.relevantProducts;
                    const relevantProductsIds: number[] =
                        newRelevantProducts.map(
                            (product) => product.product_id
                        );

                    setRelevantProducts(
                        products
                            .filter((product) =>
                                relevantProductsIds.includes(product.id)
                            )
                            .sort((a, b) => {
                                const indexA = relevantProductsIds.indexOf(
                                    a.id
                                );
                                const indexB = relevantProductsIds.indexOf(
                                    b.id
                                );
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
                const response = await axios.get(
                    `/api/reviews/${productDetail.id}`
                );
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

    const checkImageExists = (imageName: string | null) => {
        try {
            require(`../../assets/images/${imageName}.jpg`);
            return true;
        } catch (error) {
            return false;
        }
    };

    const handleDecrease = () => setQuantity((quantity) => quantity - 1);
    const handleIncrease = () => setQuantity((quantity) => quantity + 1);
    const handleStarClick = (rating: number) => {
        setRatingScore(rating);
    };

    const handleReviewTextChange = (
        event: React.ChangeEvent<HTMLTextAreaElement>
    ) => {
        setReviewText(event.target.value);
    };
    const handleAddingCart = async (user_id: string, product: Product) => {
        if (uid === "") {
            addToast(
                "Login required",
                "You need to login to use this feature."
            );
            return;
        } else {
            if (productDetail.stock === 0) {
                addToast("Out of stock", "The product is out of stock.");
                return;
            } else if (quantity === 0) {
                addToast(
                    "Invalid action",
                    "The quantity should be non-zero to complete the action."
                );
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
                addToast(
                    "Add cart item",
                    "Product added to cart successfully."
                );
            }
        } catch (err) {
            throw err;
        }
    };

    const handleAddingWishlist = async (
        user_id: string,
        product_id: number
    ) => {
        if (uid === "") {
            addToast(
                "Login required",
                "You need to login to use this feature."
            );
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
                    setWishlist((list) =>
                        list.filter((item) => item.product.id !== product_id)
                    );
                    addToast(
                        "Remove wishlist item",
                        "Item removed from wishlist successfully"
                    );
                }
            } else {
                const response = await axios.post("/api/wishlist/", {
                    uid: user_id,
                    pid: product_id,
                });
                if (response.status === 200) {
                    console.log(response.data.msg);
                    const newProduct = products.filter(
                        (product) => product.id === product_id
                    )[0];
                    setWishlist((list) => [
                        ...list,
                        {
                            id: product_id,
                            product: newProduct,
                        },
                    ]);
                    addToast(
                        "Add wishlist item",
                        "Item added to wishlist successfully"
                    );
                }
            }
        } catch (err) {
            console.error(err);
        }
    };

    const handleSubmitReview = async (
        uid: string,
        pid: number,
        rating: number,
        reviewText: string
    ) => {
        if (ratingScore === 0) {
            addToast(
                "Invalid rating",
                "The rating score should be from 1 to 5"
            );
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
                addToast(
                    "Submit review",
                    "Review has been submitted successfully."
                );
                window.location.reload();
            }
        } catch (err) {
            throw err;
        }
    };

    console.log(wishlist);

    if (pid <= 0) {
        return <NoPage />;
    }
    return (
        <Layout>
            <NavigationBar />
            <div className="product__container">
                <div className="product__container__detail">
                    <div className="product__container__detail__img">
                        <div className="product__container__detail__img__main">
                            <img
                                src={
                                    checkImageExists(productDetail.main_image)
                                        ? require(`../../assets/images/${productDetail.main_image}.jpg`)
                                        : require(`../../assets/images/product_placeholder.jpg`)
                                }
                                alt="Main"
                            />
                        </div>
                        {/* <div className="product__container__detail__img__sub">
                            <img
                                src={require("../../assets/images/product_placeholder.jpg")}
                                alt="Sub-img-1"
                            />
                            <img
                                src={require("../../assets/images/product_placeholder.jpg")}
                                alt="Sub-img-2"
                            />
                            <img
                                src={require("../../assets/images/product_placeholder.jpg")}
                                alt="Sub-img-3"
                            />
                            <img
                                src={require("../../assets/images/product_placeholder.jpg")}
                                alt="Sub-img-4"
                            />
                        </div> */}
                    </div>
                    <div className="product__container__detail__info">
                        <div
                            style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: "1rem",
                            }}
                        >
                            <div
                                style={{
                                    display: "flex",
                                    flexDirection: "row",
                                    alignItems: "center",
                                    gap: "2rem",
                                }}
                            >
                                <div
                                    style={{
                                        display: "flex",
                                        flexDirection: "row",
                                    }}
                                >
                                    {ratingStar(
                                        productDetail.rating,
                                        "#FFCC4A",
                                        24
                                    )}
                                </div>
                                <span
                                    style={{
                                        fontSize: "22px",
                                    }}
                                >
                                    {productDetail.rating} (
                                    {productDetail.reviews})
                                </span>
                            </div>
                            <strong style={{ fontSize: "36px", width: "100%" }}>
                                {productDetail.name}
                            </strong>
                            <div>
                                <strong
                                    style={{ fontSize: "28px", color: "red" }}
                                >
                                    $
                                    {productDetail.sale_price ||
                                        productDetail.price}
                                </strong>
                            </div>
                            <div
                                style={{
                                    fontSize: "22px",
                                    display: "flex",
                                    flexDirection: "column",
                                }}
                            >
                                <p>Category: {productDetail.category}</p>
                                <p>Brand: {productDetail.brand}</p>
                                <p>
                                    Status:{" "}
                                    <span
                                        style={{
                                            color: "red",
                                            fontWeight: "bold",
                                        }}
                                    >
                                        {" "}
                                        {productDetail.stock > 0
                                            ? "In stock"
                                            : "Out of stock"}
                                    </span>
                                </p>
                            </div>
                        </div>

                        <div className="product__container__detail__quantity">
                            <h5>Quantity</h5>
                            <div
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                }}
                            >
                                <button
                                    style={{
                                        borderRight: "none",
                                        borderTopLeftRadius: "20px",
                                        borderBottomLeftRadius: "20px",
                                    }}
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
                                    style={{
                                        borderLeft: "none",
                                        borderTopRightRadius: "20px",
                                        borderBottomRightRadius: "20px",
                                    }}
                                    type="button"
                                    onClick={handleIncrease}
                                >
                                    +
                                </button>
                            </div>
                        </div>
                        <div className="product__container__detail__btn">
                            <button
                                type="button"
                                style={{
                                    backgroundColor: "#3D3D3d",
                                    color: "white",
                                }}
                                onClick={() =>
                                    handleAddingCart(uid, productDetail)
                                }
                            >
                                Add to cart
                            </button>
                            <button
                                type="button"
                                onClick={() =>
                                    handleAddingWishlist(uid, productDetail.id)
                                }
                            >
                                {wishlist.some(
                                    (item) => item.product.id === pid
                                )
                                    ? "Remove from wishlist"
                                    : "Add to wishlist"}
                            </button>
                        </div>
                    </div>
                </div>
                <div className="product__container__navigation">
                    <div className="product__container__navigation__btn">
                        <button
                            type="button"
                            className={!toggle ? "active" : ""}
                            onClick={() => setToggle(false)}
                        >
                            Description
                        </button>
                        <button
                            type="button"
                            className={toggle ? "active" : ""}
                            onClick={() => setToggle(true)}
                        >
                            Review ({reviews.length})
                        </button>
                        <div className="product__container__navigation__btn__empty"></div>
                    </div>
                </div>
                {toggle ? (
                    <div className="product__container__review">
                        {!uid ? (
                            <div className="product__container__review__rating">
                                You need to login to use this feature
                            </div>
                        ) : (
                            <>
                                <div className="product__container__review__rating">
                                    <h5>Rating</h5>
                                    <div
                                        style={{
                                            display: "flex",
                                            flexDirection: "row",
                                            alignItems: "center",
                                            gap: "3rem",
                                        }}
                                    >
                                        <div className="product__container__review__rating__score">
                                            {[1, 2, 3, 4, 5].map((star) => (
                                                <span
                                                    key={star}
                                                    onClick={() =>
                                                        handleStarClick(star)
                                                    }
                                                    style={{
                                                        cursor: "pointer",
                                                    }}
                                                >
                                                    {star <= ratingScore ? (
                                                        <BsStarFill
                                                            size={24}
                                                            color="#FFCC4A"
                                                        />
                                                    ) : (
                                                        <BsStar
                                                            size={24}
                                                            color="#FFCC4A"
                                                        />
                                                    )}
                                                </span>
                                            ))}
                                            <span
                                                style={{
                                                    fontWeight: "bold",
                                                    fontSize: "24px",
                                                    marginLeft: "1.5rem",
                                                }}
                                            >
                                                ({ratingScore.toFixed(1)})
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <div className="product__container__review__text">
                                    <h5>Review</h5>
                                    <textarea
                                        name="review"
                                        id="review"
                                        value={reviewText}
                                        onChange={handleReviewTextChange}
                                        rows={10}
                                        placeholder="Enter your review"
                                    ></textarea>
                                    <button
                                        className="btn btn-primary"
                                        type="submit"
                                        onClick={() =>
                                            handleSubmitReview(
                                                uid,
                                                productDetail.id,
                                                ratingScore,
                                                reviewText
                                            )
                                        }
                                        style={{
                                            padding: "0.5rem 1rem",
                                            fontSize: "1.25rem",
                                            marginBottom: "3rem",
                                        }}
                                    >
                                        Submit
                                    </button>
                                </div>
                                <div className="product__container__review__list">
                                    <h5>All reviews ({reviews.length})</h5>
                                    <div
                                        style={{
                                            display: "flex",
                                            flexDirection: "column",
                                            gap: "1rem",
                                            marginTop: "2rem",
                                        }}
                                    >
                                        {reviews.map((review) => (
                                            <div
                                                style={{
                                                    display: "flex",
                                                    flexDirection: "column",
                                                    gap: "1rem",
                                                    borderBottom:
                                                        "1px solid black",
                                                }}
                                            >
                                                <div
                                                    style={{
                                                        display: "flex",
                                                        flexDirection: "row",
                                                        gap: "2rem",
                                                        alignItems: "center",
                                                    }}
                                                >
                                                    <strong>
                                                        {review.username}
                                                    </strong>
                                                    <span
                                                        style={{
                                                            display: "flex",
                                                            flexDirection:
                                                                "row",
                                                            gap: "0.5rem",
                                                        }}
                                                    >
                                                        {ratingStar(
                                                            review.rating,
                                                            "#FFCC4A",
                                                            18
                                                        )}
                                                    </span>
                                                    <span>
                                                        {new Date(
                                                            review.created_at
                                                        ).toLocaleDateString(
                                                            "en-GB"
                                                        )}
                                                    </span>
                                                </div>
                                                <div>
                                                    <p>{review.reviewText}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                ) : (
                    <div className="product__container__description">
                        <h5>Description</h5>
                        <p>
                            Lorem ipsum dolor sit amet, consectetur adipiscing
                            elit, sed do eiusmod tempor incididunt ut labore et
                            dolore magna aliqua. Morbi tincidunt augue interdum
                            velit euismod in pellentesque. Nunc sed id semper
                            risus in hendrerit gravida. Diam vel quam elementum
                            pulvinar etiam non quam lacus. Amet massa vitae
                            tortor condimentum lacinia quis vel eros donec.
                            Donec massa sapien faucibus et. Dui ut ornare lectus
                            sit. Quam pellentesque nec nam aliquam sem.
                            Ultricies integer quis auctor elit. Penatibus et
                            magnis dis parturient montes nascetur ridiculus mus
                            mauris. Euismod in pellentesque massa placerat duis
                            ultricies. Donec enim diam vulputate ut pharetra sit
                            amet. At tempor commodo ullamcorper a lacus
                            vestibulum. Risus pretium quam vulputate dignissim.
                            Tincidunt tortor aliquam nulla facilisi cras.
                            Accumsan tortor posuere ac ut consequat semper
                            viverra nam. Dictum sit amet justo donec. Ultricies
                            lacus sed turpis tincidunt id aliquet risus.
                            {productDetail.description}
                        </p>
                    </div>
                )}

                <RecommendedProduct
                    pid={productDetail.id}
                    relevantProducts={relevantProducts}
                />
            </div>
        </Layout>
    );
};

export default ProductPage;
