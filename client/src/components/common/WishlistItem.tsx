import { useEffect, useState } from "react";
import { Button, Modal } from "react-bootstrap";
import { IoTrashBinOutline } from "react-icons/io5";
import { useNavigate } from "react-router-dom";
import { Product } from "../../utils/interface";
import axios from "../../api/axios";

interface Item {
    id: number;
    product: Product;
}

type WishlistItemProps = {
    item: Item;
    uid: string;
    onAddingCart: (user_id: string, product_id: number) => void;
    onRemoveWishlist: (user_id: string, product_id: number) => void;
};

const WishlistItem = ({
    item,
    uid,
    onAddingCart,
    onRemoveWishlist,
}: WishlistItemProps) => {
    const { id, product } = item;
    const [show, setShow] = useState<boolean>(false);
    const navigate = useNavigate();
    const handleClose = () => setShow(false);
    const handleClickRemove = (id: number) => {
        setShow(true);
    };
    const [image, setImage] = useState<string | null>(null);
    const imageUrl = product.main_image
        ? product.main_image.replace(".jpg", "")
        : null;

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
        <div className="wishlist__main__item">
            <div
                className="wishlist__main__item__image"
                onClick={() => navigate(`/product?id=${item.product.id}`)}
            >
                {image ? (
                    <img src={image} alt={product.name} />
                ) : (
                    <img
                        src={require("../../assets/images/product_placeholder.jpg")}
                        alt={product.name}
                    />
                )}
            </div>
            <div className="wishlist__main__item__product">
                <div style={{ fontWeight: "bold", marginBottom: "1rem" }}>
                    {product.name}
                </div>
                <div>Category: {product.category}</div>
                <div>Brand: {product.brand}</div>
            </div>
            <div className="wishlist__main__item__price">
                ${product.sale_price ? product.sale_price : product.price}
            </div>
            <div className="wishlist__main__item__stock">
                {product.stock > 0 ? "In stock" : "Out of stock"}{" "}
            </div>
            <div className="wishlist__main__item__button">
                <button
                    type="button"
                    onClick={() => onAddingCart(uid, product.id)}
                >
                    Add to cart
                </button>
            </div>
            <div className="wishlist__main__item__delete">
                <button
                    type="button"
                    onClick={() => handleClickRemove(id)}
                    style={{ border: "none" }}
                >
                    <IoTrashBinOutline size={32} />
                </button>
            </div>
            <Modal show={show} onHide={handleClose}>
                <Modal.Header closeButton>
                    <Modal.Title>Remove Wishlist</Modal.Title>
                </Modal.Header>
                <Modal.Body>Are you sure to remove this item?</Modal.Body>
                <Modal.Footer>
                    <Button variant="secondary" onClick={handleClose}>
                        Close
                    </Button>
                    <Button
                        variant="primary"
                        onClick={() => {
                            onRemoveWishlist(uid, item.product.id);
                            setShow(false);
                        }}
                    >
                        Save Changes
                    </Button>
                </Modal.Footer>
            </Modal>
        </div>
    );
};

export default WishlistItem;
