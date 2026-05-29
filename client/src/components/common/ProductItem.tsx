import React, { memo } from "react";
import { HeartIcon, HeartFillIcon } from "../common/Icons";
import { useNavigate } from "react-router-dom";
import { Product } from "../../utils/interface";
import ratingStar from "../../utils/ratingStar";
import loadImage from "../../utils/loadImage";
type ProductProps = {
    product: Product;
    uid: string;
    isWishlist: boolean;
    isWishlistPending?: boolean;
    onToggleWishlist: (user_id: string, product_id: number) => void;
    onAddingCart: (user_id: string, product_id: number) => void;
};

const ProductItem = ({ product, uid, isWishlist, isWishlistPending = false, onToggleWishlist, onAddingCart }: ProductProps) => {
    const navigate = useNavigate();
    const imageUrl = product.main_image ? product.main_image.replace(".jpg", "") : null;

    return (
        <div className="home__product__menu__item" key={product.id}>
            <div className="home__product__menu__item__image" onClick={() => navigate(`/product?id=${product.id}`)}>
                {loadImage(imageUrl, product.name)}
            </div>

            <button
                type="button"
                className={`home__product__menu__item__like${isWishlist ? " home__product__menu__item__like--active" : ""}`}
                onClick={() => onToggleWishlist(uid, product.id)}
                aria-label={isWishlist ? "Remove from wishlist" : "Add to wishlist"}
                aria-pressed={isWishlist}
                disabled={isWishlistPending}
                title={isWishlist ? "Remove from wishlist" : "Add to wishlist"}
            >
                {isWishlist ? <HeartFillIcon size={16} color="currentColor" /> : <HeartIcon size={16} color="currentColor" />}
            </button>

            <p className="home__product__menu__item__category">{product.category}</p>
            <p className="home__product__menu__item__name">{product.name}</p>
            {product.sale_price ? (
                <div className="home__product__menu__item__priceRow">
                    <span className="home__product__menu__item__priceOriginal">${product.price}</span>
                    <span className="home__product__menu__item__priceSale">${product.sale_price}</span>
                </div>
            ) : (
                <div className="home__product__menu__item__priceRow">
                    <span className="home__product__menu__item__priceCurrent">${product.price}</span>
                </div>
            )}

            <div className="home__product__menu__item__rating">
                <div
                    style={{
                        width: "10rem",
                        display: "flex",
                        gap: "0.25rem",
                    }}
                >
                    {ratingStar(product.rating)}
                </div>

                <button type="button" onClick={() => onAddingCart(uid, product.id)} style={{ fontSize: "16px" }}>
                    Add to cart
                </button>
            </div>
        </div>
    );
};

export default memo(ProductItem);
