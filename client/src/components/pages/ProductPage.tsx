import { useEffect, useState } from "react";
import { BsStar, BsStarFill } from "react-icons/bs";
import { useNavigate } from "react-router-dom";
import Cookies from "universal-cookie";
import axios from "../../api/axios";
import "../../styles/ProductPage.scss";
import { Product } from "../../utils/interface";
import ratingStar from "../../utils/ratingStar";
import NavigationBar from "../common/NavigationBar";
import RecommendedProduct from "../common/RecommendedProduct";
import Layout from "../layout/Layout";
import ErrorPage from "./ErrorPage";

const cookies = new Cookies();

interface relevantProductsItem {
    product_id: number;
    product_name: string;
}

const ProductPage = () => {
    const navigate = useNavigate();
    const url = new URLSearchParams(window.location.search);
    const productId = url.get("id");
    const uid =
        cookies.get("rememberMe")?.uid ||
        (sessionStorage["rememberMe"]
            ? JSON.parse(sessionStorage["rememberMe"]).uid
            : "");

    const pid = productId !== null ? parseInt(productId) : 0;
    const [error, setError] = useState<string>("");
    const [products, setProducts] = useState<Product[]>([]);
    const [relevantProducts, setRelevantProducts] = useState<Product[]>([]);
    const [toggle, setToggle] = useState<boolean>(false);
    const [ratingScore, setRatingScore] = useState<number>(0);
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

    useEffect(() => {
        const fetchProduct = async () => {
            try {
                const response = await axios.get(`/api/products/${pid}`);
                if (response.status === 200) {
                    setProductDetail(response.data.product);
                    console.log(response.data.msg);
                }
            } catch (err: any) {
                setError(err.response.data.msg);
            }
        };
        fetchProduct();
        return () => {};
    }, [pid]);

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
        const fetchRelevantProducts = async () => {
            try {
                const response = await axios.get(
                    `/api/products/relevant/${pid}`
                );
                if (response.status === 200) {
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

    console.log(relevantProducts);

    const checkImageExists = (imageName: string | null) => {
        try {
            require(`../../assets/images/${imageName}.jpg`);
            return true;
        } catch (error) {
            return false;
        }
    };

    const handleDecrease = () =>
        setProductDetail((detail) => {
            return {
                ...detail,
                stock: detail.stock - 1,
            };
        });

    const handleIncrease = () =>
        setProductDetail((detail) => {
            return {
                ...detail,
                stock: detail.stock + 1,
            };
        });

    const handleStarClick = (rating: number) => {
        setRatingScore(rating);
    };

    const handleAddToCart = async (user_id: string, product: Product) => {
        if (uid === "") {
            navigate("/login");
        }
        try {
            const response = await axios.post("/api/cart/", {
                uid: user_id,
                pid: product.id,
                quantity: product.stock,
            });
            if (response.status === 200) {
                console.log(response.data.msg);
                window.location.reload();
            }
        } catch (err) {
            throw err;
        }
    };

    const handleAddToWishlist = async (user_id: string, product_id: number) => {
        if (uid === "") {
            navigate("/login");
        }
        try {
            const response = await axios.post("/api/wishlist/", {
                uid: user_id,
                pid: product_id,
            });
            if (response.status === 200) {
                console.log(response.data.msg);
                window.location.reload();
            }
        } catch (err) {
            throw err;
        }
    };

    if (pid === 0) {
        return <ErrorPage error={error} />;
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
                                        "yellow",
                                        36
                                    )}
                                </div>
                                <p style={{ fontSize: "28px", margin: "0" }}>
                                    {productDetail.reviews} REVIEWS
                                </p>
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
                                    value={productDetail.stock}
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
                                    handleAddToCart(uid, productDetail)
                                }
                            >
                                Add to cart
                            </button>
                            <button
                                type="button"
                                onClick={() =>
                                    handleAddToWishlist(uid, productDetail.id)
                                }
                            >
                                Add to wishlist
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
                            Review ({productDetail.reviews})
                        </button>
                        <div className="product__container__navigation__btn__empty"></div>
                    </div>
                </div>
                {toggle ? (
                    <div className="product__container__review">
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
                                rows={10}
                                placeholder="Enter your review"
                            ></textarea>
                            <button className="btn btn-primary" type="submit">
                                Submit
                            </button>
                        </div>
                        <div className="product__container__review__list">
                            <h5>All reviews ({productDetail.reviews})</h5>
                            <div
                                style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: "1rem",
                                }}
                            >
                                {Array(productDetail.reviews).map((review) => (
                                    <div
                                        style={{
                                            display: "flex",
                                            flexDirection: "column",
                                            gap: "2rem",
                                            borderBottom: "1px solid black",
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
                                            <h6>User</h6>
                                            <span
                                                style={{
                                                    display: "flex",
                                                    flexDirection: "row",
                                                    gap: "0.5rem",
                                                }}
                                            >
                                                {ratingStar(4.0, "#FFCC4A", 24)}
                                            </span>
                                            <span>2 days ago</span>
                                        </div>
                                        <div style={{ marginBottom: "1.5rem" }}>
                                            <p>Good </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
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
                        </p>
                    </div>
                )}

                <RecommendedProduct
                    pid={productDetail.id}
                    randomProducts={relevantProducts}
                />
            </div>
        </Layout>
    );
};

export default ProductPage;
