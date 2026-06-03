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
    const visibleProducts = relevantProducts.slice(0, 9);

    return (
        <section className="product-page__recommendations">
            <div className="product-page__recommendations-list">
                {visibleProducts.length > 0 ? (
                    visibleProducts.map((product) => (
                        <article className="product-page__recommendation-card" key={product.id}>
                            <button
                                className="product-page__recommendation-image"
                                type="button"
                                onClick={() => {
                                    navigate(`/product?id=${product.id}`);
                                    window.scrollTo({ top: 0, behavior: "smooth" });
                                }}
                                aria-label={`Open ${product.name}`}
                            >
                                {loadImage(
                                    product.main_image ? product.main_image.replace(".jpg", "") : null,
                                    product.name,
                                )}
                            </button>
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
                                <div className="product-page__recommendation-rating-stars">{ratingStar(product.rating)}</div>
                                <span>{product.rating ? product.rating.toFixed(1) : "New"}</span>
                            </div>
                        </article>
                    ))
                ) : (
                    <div className="product-page__recommendations-empty">
                        Similar products will appear here as soon as we find a strong match.
                    </div>
                )}
            </div>
        </section>
    );
};

export default RecommendedProduct;
