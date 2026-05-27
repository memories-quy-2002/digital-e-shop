import React from "react";
import { useNavigate } from "react-router-dom";
import { Product } from "../../../utils/interface";
import loadImage from "../../../utils/loadImage";
import ratingStar from "../../../utils/ratingStar";

type RecommendedProps = {
    relevantProducts: Product[];
};

const RecommendedProduct = ({ relevantProducts }: RecommendedProps) => {
    const navigate = useNavigate();

    return (
        <section className="product-page__recommendations">
            <h2 className="product-page__recommendations-title">People who bought this product also buy</h2>
            <div className="product-page__recommendations-list">
                {relevantProducts.length > 0 &&
                    relevantProducts.slice(0, 9).map((product) => (
                        <div className="product-page__recommendation-card" key={product.id}>
                            <div
                                className="product-page__recommendation-image"
                                onClick={() => {
                                    navigate(`/product?id=${product.id}`);
                                    window.location.reload();
                                }}
                            >
                                {loadImage(
                                    product.main_image ? product.main_image.replace(".jpg", "") : null,
                                    product.name,
                                )}
                            </div>
                            <p className="product-page__recommendation-category">{product.category}</p>
                            <p className="product-page__recommendation-name">{product.name}</p>
                            {product.sale_price ? (
                                <div className="product-page__recommendation-price product-page__recommendation-price--sale">
                                    <p className="product-page__recommendation-price-sale">
                                        ${product.sale_price}
                                    </p>
                                    <p className="product-page__recommendation-price-original">
                                        ${product.price}
                                    </p>
                                </div>
                            ) : (
                                <div className="product-page__recommendation-price">
                                    <p>${product.price}</p>
                                </div>
                            )}

                            <div className="product-page__recommendation-rating">
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
        </section>
    );
};

export default RecommendedProduct;
