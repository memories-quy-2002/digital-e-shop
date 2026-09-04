import React, { useCallback } from "react";
import { TrashIcon } from "./Icons";
import loadImage from "../../utils/loadImage";
import type { CartValidationIssue, CheckoutCartItem } from "../../features/orders/types";
import { useT } from "../../hooks/useT";

type StockTranslator = (issue: CartValidationIssue) => string;

type CartItemProps = {
    item: CheckoutCartItem;
    validationIssue?: CartValidationIssue;
    handleQuantityChange: (itemId: number, event: React.ChangeEvent<HTMLInputElement>) => void;
    handleRemoveCartItem: (cartItemId: number) => void;
    translate?: StockTranslator;
};

const CartItem = ({
    item,
    validationIssue,
    handleQuantityChange,
    handleRemoveCartItem,
    translate,
}: CartItemProps) => {
    const t = useT();
    const imageUrl = item.main_image ? item.main_image.replace(".jpg", "") : null;
    const productPrice = item.sale_price || item.price;
    const stockCap = Math.max(item.stock, 1);
    const isUnavailable = validationIssue?.reason === "out_of_stock";

    const step = useCallback(
        (delta: number) => {
            const next = Math.min(stockCap, Math.max(1, item.quantity + delta));
            if (next === item.quantity) {
                return;
            }
            handleQuantityChange(item.cartItemId, {
                target: { value: String(next) },
            } as unknown as React.ChangeEvent<HTMLInputElement>);
        },
        [handleQuantityChange, item.cartItemId, item.quantity, stockCap],
    );

    const stockMessage = validationIssue
        ? translate
            ? translate(validationIssue)
            : validationIssue.reason === "unavailable"
              ? t("cart.unavailable")
              : validationIssue.reason === "out_of_stock"
                ? t("cart.outOfStock")
                : t("cart.insufficientStock", validationIssue.availableStock)
        : item.stock <= 5
          ? t("cart.stockLeft", item.stock)
          : null;
    return (
        <article className={validationIssue ? "cart-item is-invalid" : "cart-item"}>
            <div className="cart-item__image">{loadImage(imageUrl, item.productName)}</div>
            <div className="cart-item__info">
                <span>{item.brand}</span>
                <strong>{item.productName}</strong>
                <p>{item.category}</p>
                {validationIssue ? <small className="cart-item__issue">{stockMessage}</small> : null}
            </div>
            <div className="cart-item__qty">
                <label htmlFor={`cart-${item.cartItemId}-quantity`}>{t("cart.qty")}</label>
                <div
                    className="cart-item__stepper"
                    role="group"
                    aria-label={`Adjust quantity for ${item.productName}`}
                >
                    <button
                        type="button"
                        onClick={() => step(-1)}
                        disabled={item.quantity <= 1 || isUnavailable}
                        aria-label={t("cart.decreaseQty")}
                    >
                        −
                    </button>
                    <input
                        type="number"
                        name="quantity"
                        aria-label={`cart-${item.cartItemId}-quantity`}
                        id={`cart-${item.cartItemId}-quantity`}
                        min={1}
                        max={stockCap}
                        value={item.quantity}
                        onChange={(event) => handleQuantityChange(item.cartItemId, event)}
                        disabled={isUnavailable}
                    />
                    <button
                        type="button"
                        onClick={() => step(1)}
                        disabled={item.quantity >= stockCap || isUnavailable}
                        aria-label={t("cart.increaseQty")}
                    >
                        +
                    </button>
                </div>
                {stockMessage ? <span className="cart-item__stock">{stockMessage}</span> : null}
            </div>
            <div className="cart-item__price">
                <strong>${(productPrice * item.quantity).toFixed(2)}</strong>
                <p>${productPrice.toFixed(2)} each</p>
            </div>
            <button
                className="cart-item__remove"
                type="button"
                onClick={() => handleRemoveCartItem(item.cartItemId)}
                aria-label={`Remove ${item.productName} from cart`}
            >
                <TrashIcon size={18} />
            </button>
        </article>
    );
};

export default CartItem;
