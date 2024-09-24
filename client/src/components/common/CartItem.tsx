import React from "react";

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
    handleRemove: (cartItemId: number) => void;
};
const CartItem = ({ item, handleQuantityChange, handleRemove }: CartItemProps) => {
    const imageUrl = item.main_image ? item.main_image.replace(".jpg", "") : null;
    const productPrice = item.sale_price || item.price;
    return (
        <div key={item.cartItemId} className="cart__container__box__main__list__item">
            <div className="cart__container__box__main__list__item__image">
                {imageUrl ? (
                    <img
                        src={`https://epgq6ejr4lgv8lec.public.blob.vercel-storage.com/uploads/${imageUrl}.jpg`}
                        alt={item.productName}
                    />
                ) : (
                    <img src={require("../../assets/images/product_placeholder.jpg")} alt={item.productName} />
                )}
            </div>
            <div className="cart__container__box__main__list__item__info">
                <strong>{item.productName}</strong>
                <p>Category: {item.category}</p>
                <p>Brand: {item.brand}</p>
            </div>
            <input
                type="number"
                name="quantity"
                aria-label={`cart-${item.cartItemId}-quantity`}
                id={`cart-${item.cartItemId}-quantity`}
                min={1}
                value={item.quantity}
                onChange={(event) => handleQuantityChange(item.cartItemId, event)}
            />
            <div className="cart__container__box__main__list__item__price">
                <strong style={{ fontSize: "20px" }}>${(productPrice * item.quantity).toFixed(2)}</strong>
                <p>${productPrice.toFixed(2)} each</p>
            </div>
            <button type="button" onClick={() => handleRemove(item.cartItemId)}>
                Remove
            </button>
        </div>
    );
};

export default CartItem;
