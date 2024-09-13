import { BsHeart, BsHeartFill } from "react-icons/bs";
import { useNavigate } from "react-router-dom";
import { Product } from "../../utils/interface";
import ratingStar from "../../utils/ratingStar";
import { useEffect, useState } from "react";
import axios from "../../api/axios";

type ProductProps = {
    product: Product;
    uid: string;
    isWishlist: boolean;
    onAddingWishlist: (user_id: string, product_id: number) => void;
    onAddingCart: (user_id: string, product_id: number) => void;
};

const ShopsItem = ({ product, uid, isWishlist, onAddingWishlist, onAddingCart }: ProductProps) => {
    const navigate = useNavigate();
    const [image, setImage] = useState<string | null>(null);

    const imageUrl = product.main_image ? product.main_image.replace(".jpg", "") : null;

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
        <div className="shops__container__main__pagination__list__item" key={product.id}>
            <div
                className="shops__container__main__pagination__list__item__image"
                onClick={() => navigate(`/product?id=${product.id}`)}
            >
                {image ? (
                    <img src={image} alt={product.name} />
                ) : (
                    <img src={require("../../assets/images/product_placeholder.jpg")} alt={product.name} />
                )}
            </div>

            <div
                className="shops__container__main__pagination__list__item__like"
                onClick={() => onAddingWishlist(uid, product.id)}
            >
                {isWishlist ? <BsHeartFill size={24} color="red" /> : <BsHeart size={24} color="red" />}
            </div>

            <p className="shops__container__main__pagination__list__item__category">{product.category}</p>
            <p className="shops__container__main__pagination__list__item__name">{product.name}</p>
            {product.sale_price ? (
                <div className="d-flex flex-row gap-3 justify-content-center">
                    <p className="shops__container__main__pagination__list__item__price">${product.price}</p>
                    <p
                        style={{
                            textAlign: "center",
                            fontWeight: "bold",
                            fontSize: "18px",
                            color: "red",
                        }}
                    >
                        ${product.sale_price}
                    </p>
                </div>
            ) : (
                <p
                    className="shops__container__main__pagination__list__item__price"
                    style={{ color: "red", textDecoration: "none" }}
                >
                    ${product.price}
                </p>
            )}

            <div className="shops__container__main__pagination__list__item__rating">
                <div
                    style={{
                        width: "8rem",
                        display: "flex",
                        gap: "0.25rem",
                    }}
                >
                    {ratingStar(product.rating)}
                </div>

                <button type="button" onClick={() => onAddingCart(uid, product.id)} style={{ fontSize: "16px" }}>
                    Add to cart
                </button>
            </div>
        </div>
    );
};

export default ShopsItem;
