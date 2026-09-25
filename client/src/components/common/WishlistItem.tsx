import React, { memo } from "react";
import { CartIcon, TrashIcon } from "./Icons";
import { useNavigate } from "react-router-dom";
import { Product } from "../../utils/interface";
import loadImage from "../../utils/loadImage";
import { formatCurrency } from "../../utils/currency";
import ProductAlertControls from "../../features/productAlerts/components/ProductAlertControls";
import type { ProductAlertKey, ProductAlertPreference } from "../../features/productAlerts/types";

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
    alertPreference?: ProductAlertPreference;
    alertPreferencesLoaded?: boolean;
    alertPreferencesLoading?: boolean;
    alertSaving?: boolean;
    alertSaved?: boolean;
    alertError?: string | null;
    onAlertToggle?: (productId: number, key: ProductAlertKey, enabled: boolean) => void;
};

const WishlistItem = ({
    item,
    selected,
    onSelect,
    onMoveToCart,
    onRemoveWishlist,
    alertPreference,
    alertPreferencesLoaded = true,
    alertPreferencesLoading = false,
    alertSaving = false,
    alertSaved = false,
    alertError = null,
    onAlertToggle,
}: WishlistItemProps) => {
    const { product } = item;
    const navigate = useNavigate();
    const imageUrl = product.main_image ? product.main_image.replace(".jpg", "") : null;
    const activePrice = product.sale_price ?? product.price;
    const availableStock = product.available_stock ?? product.stock;
    const hasSale = product.sale_price !== null && product.sale_price < product.price;
    const resolvedAlertPreference: ProductAlertPreference = alertPreference ?? {
        productId: product.id,
        priceDropEnabled: false,
        backInStockEnabled: false,
    };

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
                    <small>{availableStock > 0 ? `${availableStock} in stock` : "Out of stock"}</small>
                </div>
            </div>

            <div className="wishlist__row__price">
                <strong>{formatCurrency(activePrice)}</strong>
                {hasSale ? <span>Sale from {formatCurrency(product.price)}</span> : <span>No sale change</span>}
            </div>

            <span className={availableStock > 0 ? "wishlist__stock is-in" : "wishlist__stock is-out"}>
                {availableStock > 0 ? "Available" : "Unavailable"}
            </span>

            <div className="wishlist__row__alerts">
                <ProductAlertControls
                    preference={resolvedAlertPreference}
                    variant="wishlist"
                    preferenceLoaded={alertPreferencesLoaded}
                    preferenceLoading={alertPreferencesLoading}
                    saving={alertSaving}
                    saved={alertSaved}
                    error={alertError}
                    onToggle={(key, enabled) => onAlertToggle?.(product.id, key, enabled)}
                />
            </div>

            <div className="wishlist__row__actions">
                <button type="button" onClick={() => onMoveToCart(product)} disabled={availableStock <= 0}>
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
