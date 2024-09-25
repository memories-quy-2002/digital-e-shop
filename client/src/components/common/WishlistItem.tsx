import { useState } from "react";
import { Button, Modal } from "react-bootstrap";
import { IoTrashBinOutline } from "react-icons/io5";
import { useNavigate } from "react-router-dom";
import { Product } from "../../utils/interface";

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

const WishlistItem = ({ item, uid, onAddingCart, onRemoveWishlist }: WishlistItemProps) => {
    const { product } = item;
    const [show, setShow] = useState<boolean>(false);
    const navigate = useNavigate();
    const handleClose = () => setShow(false);

    const imageUrl = product.main_image ? product.main_image.replace(".jpg", "") : null;

    return (
        <div className="wishlist__main__item">
            <div className="wishlist__main__item__product">
                <div
                    className="wishlist__main__item__product__image"
                    onClick={() => navigate(`/product?id=${item.product.id}`)}
                >
                    {imageUrl ? (
                        <img
                            src={`https://epgq6ejr4lgv8lec.public.blob.vercel-storage.com/uploads/${imageUrl}.jpg`}
                            alt={product.name}
                        />
                    ) : (
                        <img src={require("../../assets/images/product_placeholder.jpg")} alt={product.name} />
                    )}
                </div>
                <div className="wishlist__main__item__product__info">
                    <div style={{ fontWeight: "bold", marginBottom: "1rem" }}>{product.name}</div>
                    <div>Category: {product.category}</div>
                    <div>Brand: {product.brand}</div>
                </div>
            </div>
            <div className="wishlist__main__item__price">
                ${product.sale_price ? product.sale_price : product.price}
            </div>
            <div className="wishlist__main__item__stock">{product.stock > 0 ? "In stock" : "Out of stock"} </div>
            <div className="wishlist__main__item__button">
                <button type="button" onClick={() => onAddingCart(uid, product.id)}>
                    Add to cart
                </button>
            </div>
            <div className="wishlist__main__item__delete">
                <button
                    type="button"
                    data-testid="delete-btn"
                    aria-label={`delete-btn-${item.id}`}
                    onClick={() => setShow(true)}
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
