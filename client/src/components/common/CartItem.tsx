import React from "react";
import { TrashIcon } from "./Icons";
import loadImage from "../../utils/loadImage";
interface Item {
    cartItemId: number;
    productId: number;
    productName: string;
    category: string;
    brand: string;
    price: number;
    sale_price: number;
    main_image: string;
    quantity: number;
}

type CartItemProps = {
    item: Item;
    handleQuantityChange: (itemId: number, event: React.ChangeEvent<HTMLInputElement>) => void;
    handleRemoveCartItem: (cartItemId: number) => void;
};
const CartItem = ({ item, handleQuantityChange, handleRemoveCartItem }: CartItemProps) => {
    const imageUrl = item.main_image ? item.main_image.replace(".jpg", "") : null;
    const productPrice = item.sale_price || item.price;
    return (
        <article className="cart-item">
            <div className="cart-item__image">{loadImage(imageUrl, item.productName)}</div>
            <div className="cart-item__info">
                <span>{item.brand}</span>
                <strong>{item.productName}</strong>
                <p>{item.category}</p>
            </div>
            <div className="cart-item__qty">
                <label htmlFor={`cart-${item.cartItemId}-quantity`}>Qty</label>
                <input
                    type="number"
                    name="quantity"
                    aria-label={`cart-${item.cartItemId}-quantity`}
                    id={`cart-${item.cartItemId}-quantity`}
                    min={1}
                    value={item.quantity}
                    onChange={(event) => handleQuantityChange(item.cartItemId, event)}
                />
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
