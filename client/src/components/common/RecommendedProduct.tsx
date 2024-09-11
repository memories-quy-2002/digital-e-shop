import { useNavigate } from "react-router-dom";
import { Product } from "../../utils/interface";
import ratingStar from "../../utils/ratingStar";

type RecommendedProps = {
    pid: number;
    relevantProducts: Product[];
};

const RecommendedProduct = ({ pid, relevantProducts }: RecommendedProps) => {
    const navigate = useNavigate();
    const checkImageExists = (imageName: string | null) => {
        try {
            require(`../../assets/images/${imageName}.jpg`);
            return true;
        } catch (error) {
            return false;
        }
    };

    return (
        <div className="product__container__recommended">
            <h3 className="product__container__recommended__title">
                People who bought this product also buy
            </h3>
            <div className="product__container__recommended__list">
                {relevantProducts.slice(0, 9).map((product) => (
                    <div
                        className="product__container__recommended__list__item"
                        key={product.id}
                    >
                        <div
                            className="product__container__recommended__list__item__image"
                            onClick={() => {
                                navigate(`/product?id=${product.id}`);
                                window.location.reload();
                            }}
                        >
                            <img
                                src={
                                    checkImageExists(product.main_image)
                                        ? require(`../../assets/images/${product.main_image}.jpg`)
                                        : require(`../../assets/images/product_placeholder.jpg`)
                                }
                                alt="Empty"
                            />
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
                                fontSize: "16px",
                                height: "40px",
                            }}
                        >
                            {product.name}
                        </p>
                        {product.sale_price ? (
                            <div
                                style={{
                                    display: "flex",
                                    flexDirection: "row",
                                    gap: "2rem",
                                    justifyContent: "center",
                                    fontWeight: "bold",
                                    fontSize: "20px",
                                }}
                            >
                                <p
                                    style={{
                                        color: "red",
                                    }}
                                >
                                    ${product.sale_price}
                                </p>
                                <span
                                    style={{
                                        textDecoration: "line-through",
                                        color: "gray",
                                    }}
                                >
                                    ${product.price}
                                </span>
                            </div>
                        ) : (
                            <div
                                style={{
                                    textAlign: "center",
                                    fontWeight: "bold",
                                    fontSize: "20px",
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
