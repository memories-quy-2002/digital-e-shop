import React from "react";
import { useNavigate } from "react-router-dom";
import { Product } from "../../utils/interface";
import ratingStar from "../../utils/ratingStar";
import LazyLoadImage from "../../utils/LazyLoadingImage";
import productPlaceholder from "../../assets/images/product_placeholder.jpg";

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
                {relevantProducts.length > 0 &&
                    relevantProducts.slice(0, 9).map((product) => (
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
                                    <img src={productPlaceholder} alt={product.name} />
                                )}
                            </div>
                            <p className="product__container__recommended__list__item__category">{product.category}</p>
                            <p className="product__container__recommended__list__item__name">{product.name}</p>
                            {product.sale_price ? (
                                <div className="product__container__recommended__list__item__price product__container__recommended__list__item__price--sale">
                                    <p className="product__container__recommended__list__item__price--sale__sale">
                                        ${product.sale_price}
                                    </p>
                                    <p className="product__container__recommended__list__item__price--sale__original">
                                        ${product.price}
                                    </p>
                                </div>
                            ) : (
                                <div className="product__container__recommended__list__item__price">
                                    <p>${product.price}</p>
                                </div>
                            )}

                            <div className="product__container__recommended__list__item__rating">
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
