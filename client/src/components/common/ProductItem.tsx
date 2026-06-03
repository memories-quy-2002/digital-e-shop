import React, { memo } from "react";
import { HeartIcon, HeartFillIcon } from "../common/Icons";
import { Link, useNavigate } from "react-router-dom";
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
    const hasSale = product.sale_price !== null && product.sale_price !== undefined && product.sale_price < product.price;
    const activePrice = hasSale ? product.sale_price : product.price;

    return (
        <div className="home__product__menu__item" key={product.id}>
            {hasSale ? <span className="home__product__menu__item__badge">Sale</span> : null}
            <div className="home__product__menu__item__image" onClick={() => navigate(`/product?id=${product.id}`)}>
                {loadImage(imageUrl, product.name, {
                    width: "168px",
                    height: "168px",
                    objectFit: "contain",
                    display: "block",
                })}
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

            <div className="home__product__menu__item__meta">
                <p className="home__product__menu__item__category">{product.category}</p>
                <span className="home__product__menu__item__brand">{product.brand}</span>
            </div>
            <Link className="home__product__menu__item__name" to={`/product?id=${product.id}`}>
                {product.name}
            </Link>
            <p className="home__product__menu__item__stock">
                {product.stock > 0 ? `${product.stock} in stock` : "Out of stock"}
            </p>
            {hasSale ? (
                <div className="home__product__menu__item__priceRow">
                    <span className="home__product__menu__item__priceOriginal">${product.price}</span>
                    <span className="home__product__menu__item__priceSale">${activePrice}</span>
                </div>
            ) : (
                <div className="home__product__menu__item__priceRow">
                    <span className="home__product__menu__item__priceCurrent">${activePrice}</span>
                </div>
            )}

            <div className="home__product__menu__item__rating">
                <div className="home__product__menu__item__stars" aria-label={`${product.rating || 0} star rating`}>
                    {ratingStar(product.rating)}
                </div>
                <span className="home__product__menu__item__reviews">{product.reviews || 0} reviews</span>

                <button
                    type="button"
                    className="home__product__menu__item__action"
                    onClick={() => onAddingCart(uid, product.id)}
                    disabled={product.stock <= 0}
                >
                    Add to cart
                </button>
            </div>
        </div>
    );
};

export default memo(ProductItem);
