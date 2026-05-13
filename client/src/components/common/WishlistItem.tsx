import React, { memo } from "react";
import { CartIcon, TrashIcon } from "./Icons";
import { useNavigate } from "react-router-dom";
import { Product } from "../../utils/interface";
import loadImage from "../../utils/loadImage";

interface Item {
    id: number;
    product: Product;
}

type WishlistItemProps = {
    item: Item;
    selected: boolean;
    onSelect: (productId: number, checked: boolean) => void;
    onMoveToCart: (product: Product) => void;
    onRemoveWishlist: (productId: number) => void;
};

const WishlistItem = ({ item, selected, onSelect, onMoveToCart, onRemoveWishlist }: WishlistItemProps) => {
    const { product } = item;
    const navigate = useNavigate();
    const imageUrl = product.main_image ? product.main_image.replace(".jpg", "") : null;
    const activePrice = product.sale_price ?? product.price;
    const hasSale = product.sale_price !== null && product.sale_price < product.price;

    return (
        <article className="wishlist__row">
            <label className="wishlist__row__select">
                <input
                    type="checkbox"
                    checked={selected}
                    onChange={(event) => onSelect(product.id, event.target.checked)}
                    aria-label={`Select ${product.name}`}
                />
            </label>
            <div className="wishlist__row__product">
                <button
                    type="button"
                    className="wishlist__row__product__image"
                    onClick={() => navigate(`/product?id=${item.product.id}`)}
                >
                    {loadImage(imageUrl, product.name)}
                </button>
                <div className="wishlist__row__product__info">
                    <strong>{product.name}</strong>
                    <span>{product.brand} | {product.category}</span>
                    <small>{product.stock > 0 ? `${product.stock} in stock` : "Out of stock"}</small>
                </div>
            </div>

            <div className="wishlist__row__price">
                <strong>${activePrice.toFixed(2)}</strong>
                {hasSale ? <span>Sale from ${product.price.toFixed(2)}</span> : <span>No sale change</span>}
            </div>

            <span className={product.stock > 0 ? "wishlist__stock is-in" : "wishlist__stock is-out"}>
                {product.stock > 0 ? "Available" : "Unavailable"}
            </span>

            <div className="wishlist__row__actions">
                <button type="button" onClick={() => onMoveToCart(product)} disabled={product.stock <= 0}>
                    <CartIcon size={17} />
                    Move to cart
                </button>
                <button
                    type="button"
                    className="danger"
                    data-testid="delete-btn"
                    aria-label={`delete-btn-${item.id}`}
                    onClick={() => onRemoveWishlist(product.id)}
                >
                    <TrashIcon size={18} />
                </button>
            </div>
        </article>
    );
};

export default memo(WishlistItem);
