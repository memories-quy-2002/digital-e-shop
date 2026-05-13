import React, { memo } from "react";
import { CartIcon, HeartIcon, HeartFillIcon } from "../common/Icons";
import { useNavigate } from "react-router-dom";
import { Product } from "../../utils/interface";
import ratingStar from "../../utils/ratingStar";
import loadImage from "../../utils/loadImage";

type ProductProps = {
    product: Product;
    uid: string;
    isWishlist: boolean;
    onToggleWishlist: (user_id: string, product_id: number) => void;
    onAddingCart: (user_id: string, product_id: number) => void;
};

const ShopsItem = ({ product, uid, isWishlist, onToggleWishlist, onAddingCart }: ProductProps) => {
    const navigate = useNavigate();
    const imageUrl = product.main_image ? product.main_image.replace(".jpg", "") : null;
    const activePrice = product.sale_price || product.price;
    const hasSale = product.sale_price !== null && product.sale_price !== undefined && product.sale_price < product.price;

    return (
        <div className="shops__container__main__pagination__list__item" key={product.id}>
            {hasSale ? <span className="shops__container__main__pagination__list__item__badge">Sale</span> : null}
            <button
                type="button"
                className="shops__container__main__pagination__list__item__like"
                onClick={() => onToggleWishlist(uid, product.id)}
                aria-label={isWishlist ? "Remove from wishlist" : "Add to wishlist"}
            >
                {isWishlist ? <HeartFillIcon size={20} /> : <HeartIcon size={20} />}
            </button>

            <div
                className="shops__container__main__pagination__list__item__image"
                onClick={() => navigate(`/product?id=${product.id}`)}
            >
                {loadImage(imageUrl, product.name)}
            </div>

            <div className="shops__container__main__pagination__list__item__body">
                <div className="shops__container__main__pagination__list__item__meta">
                    <span>{product.category}</span>
                    <span>{product.brand}</span>
                </div>
                <p className="shops__container__main__pagination__list__item__name">{product.name}</p>
                <div className="shops__container__main__pagination__list__item__stock">
                    {product.stock > 0 ? `${product.stock} in stock` : "Out of stock"}
                </div>

                <div className="shops__container__main__pagination__list__item__price-row">
                    <p
                        className={
                            hasSale
                                ? "shops__container__main__pagination__list__item__price-sale"
                                : "shops__container__main__pagination__list__item__price-current"
                        }
                    >
                        ${activePrice}
                    </p>
                    {hasSale ? (
                        <p className="shops__container__main__pagination__list__item__price-was">${product.price}</p>
                    ) : null}
                </div>
            </div>

            <div className="shops__container__main__pagination__list__item__rating">
                <div
                    className="shops__container__main__pagination__list__item__stars"
                    aria-label={`${product.rating || 0} star rating`}
                >
                    {ratingStar(product.rating)}
                </div>

                <button type="button" onClick={() => onAddingCart(uid, product.id)} disabled={product.stock <= 0}>
                    <CartIcon size={17} />
                    Add
                </button>
            </div>
        </div>
    );
};

export default memo(ShopsItem);
