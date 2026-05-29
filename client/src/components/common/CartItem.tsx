import React from "react";
import { TrashIcon } from "./Icons";
import loadImage from "../../utils/loadImage";
import { CartValidationIssue } from "../../features/orders/types";
interface Item {
    cartItemId: number;
    productId: number;
    productName: string;
    category: string;
    brand: string;
    price: number;
    sale_price: number | null;
    main_image: string;
    quantity: number;
    stock: number;
}

type CartItemProps = {
    item: Item;
    validationIssue?: CartValidationIssue;
    handleQuantityChange: (itemId: number, event: React.ChangeEvent<HTMLInputElement>) => void;
    handleRemoveCartItem: (cartItemId: number) => void;
};
const CartItem = ({ item, validationIssue, handleQuantityChange, handleRemoveCartItem }: CartItemProps) => {
    const imageUrl = item.main_image ? item.main_image.replace(".jpg", "") : null;
    const productPrice = item.sale_price || item.price;
    const stockMessage =
        validationIssue?.reason === "unavailable"
            ? "No longer available. Remove this item to continue."
            : validationIssue?.reason === "out_of_stock"
            ? "Out of stock. Remove this item to continue."
            : validationIssue?.reason === "insufficient_stock"
              ? `Only ${validationIssue.availableStock} item(s) available.`
              : item.stock <= 5
                ? `${item.stock} left`
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
                <label htmlFor={`cart-${item.cartItemId}-quantity`}>Qty</label>
                <input
                    type="number"
                    name="quantity"
                    aria-label={`cart-${item.cartItemId}-quantity`}
                    id={`cart-${item.cartItemId}-quantity`}
                    min={1}
                    max={Math.max(item.stock, 1)}
                    value={item.quantity}
                    onChange={(event) => handleQuantityChange(item.cartItemId, event)}
                />
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
