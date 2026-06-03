import React, { memo } from "react";
import { CartIcon, HeartIcon, HeartFillIcon } from "../common/Icons";
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

const ShopsItem = ({ product, uid, isWishlist, isWishlistPending = false, onToggleWishlist, onAddingCart }: ProductProps) => {
    const navigate = useNavigate();
    const imageUrl = product.main_image ? product.main_image.replace(".jpg", "") : null;
    const activePrice = product.sale_price || product.price;
    const hasSale = product.sale_price !== null && product.sale_price !== undefined && product.sale_price < product.price;

    return (
        <div className="shops__card" key={product.id}>
            {hasSale ? <span className="shops__card-badge">Sale</span> : null}
            <button
                type="button"
                className={`shops__card-like${isWishlist ? " shops__card-like--active" : ""}`}
                onClick={() => onToggleWishlist(uid, product.id)}
                aria-label={isWishlist ? "Remove from wishlist" : "Add to wishlist"}
                aria-pressed={isWishlist}
                disabled={isWishlistPending}
                title={isWishlist ? "Remove from wishlist" : "Add to wishlist"}
            >
                {isWishlist ? <HeartFillIcon size={14} /> : <HeartIcon size={14} />}
            </button>

            <button
                type="button"
                className="shops__card-image"
                onClick={() => navigate(`/product?id=${product.id}`)}
                aria-label={`View ${product.name}`}
            >
                {loadImage(imageUrl, product.name, {
                    width: "168px",
                    height: "168px",
                    objectFit: "contain",
                    display: "block",
                }, false, "(min-width: 1280px) 19vw, (min-width: 1024px) 25vw, (min-width: 768px) 34vw, 92vw")}
            </button>

            <div className="shops__card-body">
                <div className="shops__card-meta">
                    <span>{product.category}</span>
                    <span>{product.brand}</span>
                </div>
                <Link className="shops__card-name" to={`/product?id=${product.id}`}>
                    {product.name}
                </Link>
                <div className={`shops__card-stock${product.stock > 0 ? "" : " shops__card-stock--empty"}`}>
                    {product.stock > 0 ? `${product.stock} in stock` : "Out of stock"}
                </div>

                <div className="shops__card-price-row">
                    <p
                        className={
                            hasSale
                                ? "shops__card-price-sale"
                                : "shops__card-price-current"
                        }
                    >
                        ${activePrice}
                    </p>
                    {hasSale ? <p className="shops__card-price-was">${product.price}</p> : null}
                </div>
            </div>

            <div className="shops__card-rating">
                <div className="shops__card-review">
                    <div className="shops__card-stars" aria-label={`${product.rating || 0} star rating`}>
                        {ratingStar(product.rating)}
                    </div>
                    <span className="shops__card-review-count">{product.reviews || 0} reviews</span>
                </div>

                <button
                    type="button"
                    className="shops__card-action"
                    onClick={() => onAddingCart(uid, product.id)}
                    disabled={product.stock <= 0}
                >
                    <CartIcon size={17} />
                    Add to cart
                </button>
            </div>
        </div>
    );
};

export default memo(ShopsItem);
