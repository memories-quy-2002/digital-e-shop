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
    const formatPrice = (value: number) => `$${Number(value || 0).toFixed(2)}`;

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
                                    className="product-page__recommendation-image product-page__recommendation-image--fixed de-product-media de-product-media--catalog w-full max-w-none"
                                    data-testid="recommendation-image"
                                    type="button"
                                    onClick={() => {
                                        navigate(`/product?id=${normalizedProduct.id}`);
                                        window.scrollTo({ top: 0, behavior: "smooth" });
                                    }}
                                    aria-label={`Open ${normalizedProduct.name}`}
                                >
                                    {loadImage(normalizedProduct.main_image, normalizedProduct.name, {
                                        width: "100%",
                                        height: "100%",
                                        objectFit: "contain",
                                    }, false, "(min-width: 1180px) 20vw, (min-width: 860px) 25vw, (min-width: 560px) 33vw, 45vw")}
                                </button>
                                <p className="product-page__recommendation-category">{normalizedProduct.category || "Other"}</p>
                                <p className="product-page__recommendation-name">{normalizedProduct.name}</p>
                                {hasSale ? (
                                    <div className="product-page__recommendation-price product-page__recommendation-price--sale">
                                        <p className="product-page__recommendation-price-sale">{formatPrice(normalizedProduct.sale_price ?? 0)}</p>
                                        <p className="product-page__recommendation-price-original">
                                            {formatPrice(normalizedProduct.price)}
                                        </p>
                                    </div>
                                ) : (
                                    <div className="product-page__recommendation-price">
                                        <p>{formatPrice(normalizedProduct.price)}</p>
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
