import React, { useEffect, useState } from "react";
import axios from "../../api/axios";

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
    const [image, setImage] = useState<string | null>(null);
    const imageUrl = item.image ? item.image.replace(".jpg", "") : null;

    useEffect(() => {
        const fetchImage = async () => {
            try {
                if (imageUrl) {
                    // Fetch image from the server
                    const response = await axios.get(
                        `/api/products/images/${imageUrl}`,
                        { responseType: "blob" } // Request as blob
                    );

                    if (response.status === 200) {
                        const blob = new Blob([response.data], {
                            type: "image/jpeg",
                        });
                        const url = URL.createObjectURL(blob); // Create a Blob URL

                        setImage(url); // Set the Blob URL as the image source
                    } else {
                        console.error("Error loading image");
                    }
                } else {
                    console.error("Image not found");
                }
            } catch (error) {
                console.error("Error fetching image:", error);
            }
        };

        fetchImage();
        // Clean up the Blob URL after component unmount
        return () => {
            if (image) {
                URL.revokeObjectURL(image);
            }
        };
    }, [imageUrl]);
    return (
        <div
            key={item.cartItemId}
            className="cart__container__box__main__list__item"
        >
            <div className="cart__container__box__main__list__item__image">
                {image ? (
                    <img src={image} alt={item.productName} />
                ) : (
                    <img
                        src={require("../../assets/images/product_placeholder.jpg")}
                        alt={item.productName}
                    />
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
