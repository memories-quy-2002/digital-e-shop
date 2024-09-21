import { useNavigate } from "react-router-dom";
import { Product } from "../../utils/interface";
import ratingStar from "../../utils/ratingStar";
import LazyLoadImage from "../../utils/LazyLoadingImage";

type RecommendedProps = {
    pid: number;
    relevantProducts: Product[];
};

const RecommendedProduct = ({ pid, relevantProducts }: RecommendedProps) => {
    const navigate = useNavigate();

    return (
        <div className="product__container__recommended">
            <h3 className="product__container__recommended__title">People who bought this product also buy</h3>
            <div className="product__container__recommended__list">
                {relevantProducts.slice(0, 9).map((product) => (
                    <div className="product__container__recommended__list__item" key={product.id}>
                        <div
                            className="product__container__recommended__list__item__image"
                            onClick={() => {
                                navigate(`/product?id=${product.id}`);
                                window.location.reload();
                            }}
                        >
                            {product.main_image ? (
                                <LazyLoadImage
                                    src={`https://epgq6ejr4lgv8lec.public.blob.vercel-storage.com/uploads/${product.main_image}.jpg`}
                                    alt={product.name}
                                />
                            ) : (
                                <img src={require("../../assets/images/product_placeholder.jpg")} alt={product.name} />
                            )}
                        </div>
                        <p
                            style={{
                                textAlign: "center",
                                fontWeight: "bold",
                                color: "#939393",
                            }}
                        >
                            {product.category}
                        </p>
                        <p
                            style={{
                                textAlign: "center",
                                fontWeight: "bold",
                                fontSize: "1rem",
                                height: "3rem",
                            }}
                        >
                            {product.name}
                        </p>
                        {product.sale_price ? (
                            <div
                                style={{
                                    display: "flex",
                                    flexDirection: "row",
                                    gap: "0.75rem",
                                    justifyContent: "center",
                                    fontWeight: "bold",
                                    fontSize: "1rem",
                                }}
                            >
                                <p
                                    style={{
                                        color: "red",
                                    }}
                                >
                                    ${product.sale_price}
                                </p>
                                <p
                                    style={{
                                        textDecoration: "line-through",
                                        color: "gray",
                                    }}
                                >
                                    ${product.price}
                                </p>
                            </div>
                        ) : (
                            <div
                                style={{
                                    textAlign: "center",
                                    fontWeight: "bold",
                                    fontSize: "1rem",
                                    color: "red",
                                }}
                            >
                                <p>${product.price}</p>
                            </div>
                        )}

                        <div
                            style={{
                                display: "flex",
                                flexDirection: "row",
                                justifyContent: "space-between",
                                padding: "1rem 1.5rem",
                            }}
                        >
                            <div
                                style={{
                                    width: "240px",
                                    display: "flex",
                                    gap: "5px",
                                }}
                            >
                                {ratingStar(product.rating)}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default RecommendedProduct;
