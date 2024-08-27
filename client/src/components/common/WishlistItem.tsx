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

    const checkImageExists = (imageName: string | null) => {
        try {
            require(`../../assets/images/${imageName}.jpg`);
            return true;
        } catch (error) {
            return false;
        }
    };
    return (
        <div className="wishlist__main__item">
            <div
                className="wishlist__main__item__image"
                onClick={() => navigate(`/product?id=${item.product.id}`)}
            >
                <img
                    src={
                        checkImageExists(product.main_image)
                            ? require(`../../assets/images/${product.main_image}.jpg`)
                            : require(`../../assets/images/product_placeholder.jpg`)
                    }
                    alt={product.name}
                />
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
