import React from "react";

interface Item {
    cartItemId: number;
    productId: number;
    productName: string;
    category: string;
    brand: string;
    price: number;
    image: string;
    quantity: number;
}

type CartItemProps = {
    item: Item;
    handleQuantityChange: (
        itemId: number,
        event: React.ChangeEvent<HTMLInputElement>
    ) => void;
    handleRemove: (cartItemId: number) => void;
};
const CartItem = ({
    item,
    handleQuantityChange,
    handleRemove,
}: CartItemProps) => {
    return (
        <div
            key={item.cartItemId}
            className="cart__container__box__main__list__item"
        >
            <div className="cart__container__box__main__list__item__image">
                <img
                    src={
                        item.image
                            ? require(`../../assets/images/${item.image}.jpg`)
                            : require(`../../assets/images/product_placeholder.jpg`)
                    }
                    alt="Empty"
                />
            </div>
            <div className="cart__container__box__main__list__item__info">
                <strong>{item.productName}</strong>
                <p>Category: {item.category}</p>
                <p>Brand: {item.brand}</p>
            </div>
            <input
                type="number"
                name="quantity"
                id={`cart-${item.cartItemId}`}
                value={item.quantity}
                onChange={(event) =>
                    handleQuantityChange(item.cartItemId, event)
                }
            />
            <div className="cart__container__box__main__list__item__price">
                <strong style={{ fontSize: "20px" }}>
                    ${item.price * item.quantity}
                </strong>
                <p>${item.price} each</p>
            </div>
            <button type="button" onClick={() => handleRemove(item.cartItemId)}>
                Remove
            </button>
        </div>
    );
};

export default CartItem;
