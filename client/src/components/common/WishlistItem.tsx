import React, { useState } from "react";
import { Button, Modal } from "react-bootstrap";
import { IoTrashBinOutline } from "react-icons/io5";
import { useNavigate } from "react-router-dom";
import { Product } from "../../utils/interface";
import productPlaceholder from "../../assets/images/product_placeholder.jpg";
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
        <div className="wishlist__row">
            {/* Product */}
            <div className="wishlist__row__product">
                <div
                    className="wishlist__row__product__image"
                    onClick={() => navigate(`/product?id=${item.product.id}`)}
                >
                    {imageUrl ? (
                        <img
                            src={`https://epgq6ejr4lgv8lec.public.blob.vercel-storage.com/uploads/${imageUrl}.jpg`}
                            alt={product.name}
                        />
                    ) : (
                        <img src={productPlaceholder} alt={product.name} />
                    )}
                </div>
                <div className="wishlist__row__product__info">
                    <div className="wishlist__row__product__info__name">{product.name}</div>
                    <div className="wishlist__row__product__info__category">Category: {product.category}</div>
                    <div className="wishlist__row__product__info__brand">Brand: {product.brand}</div>
                </div>
            </div>

            {/* Price */}
            <div className="wishlist__row__price">${product.sale_price ? product.sale_price : product.price}</div>

            {/* Stock */}
            {product.stock > 0 ? (
                <div className="wishlist__row__stock wishlist__row__stock--in">In stock</div>
            ) : (
                <div className="wishlist__row__stock wishlist__row__stock--out">Out of stock</div>
            )}

            {/* Button */}
            <div className="wishlist__row__button">
                <button type="button" onClick={() => onAddingCart(uid, product.id)}>
                    Add to cart
                </button>
            </div>

            {/* Delete */}
            <div className="wishlist__row__delete">
                <button
                    type="button"
                    data-testid="delete-btn"
                    aria-label={`delete-btn-${item.id}`}
                    onClick={() => setShow(true)}
                >
                    <IoTrashBinOutline size={24} />
                </button>
            </div>

            {/* Modal */}
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
