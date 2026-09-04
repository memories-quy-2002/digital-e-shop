import React from "react";
import { useNavigate } from "react-router-dom";
import { Product } from "../../../utils/interface";
import loadImage from "../../../utils/loadImage";
import { formatProductRating, normalizeProduct } from "../../../utils/product";
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
                    visibleProducts.map((product) => {
                        const normalizedProduct = normalizeProduct(product);
                        const hasSale =
                            normalizedProduct.sale_price !== null &&
                            normalizedProduct.sale_price > 0 &&
                            normalizedProduct.sale_price < normalizedProduct.price;

                        return (
                            <article className="product-page__recommendation-card" key={normalizedProduct.id}>
                            <button
                                className="product-page__recommendation-image"
                                type="button"
                                onClick={() => {
                                    navigate(`/product?id=${normalizedProduct.id}`);
                                    window.scrollTo({ top: 0, behavior: "smooth" });
                                }}
                                aria-label={`Open ${normalizedProduct.name}`}
                            >
                                {loadImage(
                                    normalizedProduct.main_image ? normalizedProduct.main_image.replace(".jpg", "") : null,
                                    normalizedProduct.name,
                                )}
                            </button>
                            <p className="product-page__recommendation-category">{normalizedProduct.category}</p>
                            <p className="product-page__recommendation-name">{normalizedProduct.name}</p>
                            {hasSale ? (
                                <div className="product-page__recommendation-price product-page__recommendation-price--sale">
                                    <p className="product-page__recommendation-price-sale">${normalizedProduct.sale_price}</p>
                                    <p className="product-page__recommendation-price-original">
                                        ${normalizedProduct.price}
                                    </p>
                                </div>
                            ) : (
                                <div className="product-page__recommendation-price">
                                    <p>${normalizedProduct.price}</p>
                                </div>
                            )}

                            <div className="product-page__recommendation-rating">
                                <div className="product-page__recommendation-rating-stars" aria-label={`${formatProductRating(normalizedProduct.rating)} star rating`}>
                                    {ratingStar(normalizedProduct.rating)}
                                </div>
                                <span>{normalizedProduct.rating ? formatProductRating(normalizedProduct.rating) : "New"}</span>
                            </div>
                            </article>
                        );
                    })
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
