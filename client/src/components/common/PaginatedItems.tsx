import React, { useState } from "react";
import ReactPaginate from "react-paginate";
import { Product } from "../../utils/interface";
import ProductItem from "./ProductItem";
import WishlistItem from "./WishlistItem";
import axios from "../../api/axios";
import { useNavigate } from "react-router-dom";
import { Toast, ToastContainer } from "react-bootstrap";

interface Item {
    id: number;
    product: Product;
}

type PaginatedProps = {
    itemsPerPage: number;
    items: Product[] | Item[];
    uid: string;
    wishlist: Product[];
};

const PaginatedItems = ({
    itemsPerPage,
    items,
    uid,
    wishlist,
}: PaginatedProps) => {
    const [show, setShow] = useState<boolean>(false);
    const [msg, setMsg] = useState<string>("");
    const toggleShow = () => setShow(!show);
    const navigate = useNavigate();
    const onAddingWishlist = async (user_id: string, product_id: number) => {
        if (uid === "") {
            navigate("/login");
        }
        try {
            const response = await axios.post("/api/wishlist/", {
                uid: user_id,
                pid: product_id,
            });
            if (response.status === 200) {
                console.log(response.data.msg);
                setShow(!show);
            }
            console.log(show);
        } catch (err) {
            throw err;
        }
    };
    const onAddingCart = async (user_id: string, product_id: number) => {
        if (uid === "") {
            navigate("/login");
        }
        try {
            const response = await axios.post("/api/cart/", {
                uid: user_id,
                pid: product_id,
                quantity: 1,
            });
            if (response.status === 200) {
                console.log(response.data.msg);
                setShow(!show);
                setMsg("You added a product to your cart successfully");
            }
        } catch (err) {
            throw err;
        }
    };
    const [itemOffset, setItemOffset] = useState(0);
    const endOffset = itemOffset + itemsPerPage;
    console.log(`Loading items from ${itemOffset} to ${endOffset}`);
    const currentItems = items.slice(itemOffset, endOffset);
    const pageCount = Math.ceil(items.length / itemsPerPage);

    const handlePageClick = (event: any) => {
        const newOffset = (event.selected * itemsPerPage) % items.length;
        console.log(
            `User requested page number ${event.selected}, which is offset ${newOffset}`
        );
        setItemOffset(newOffset);
    };

    return (
        <div className="shops__container__main__pagination">
            {currentItems.length > 0 ? (
                !("product" in currentItems[0]) ? (
                    <div className="shops__container__main__pagination__list">
                        {currentItems.map((item) => {
                            return (
                                <ProductItem
                                    key={item.id}
                                    product={item as Product}
                                    uid={uid}
                                    isWishlist={wishlist.some(
                                        (wishlistProduct) =>
                                            wishlistProduct.id === item.id
                                    )}
                                    onAddingWishlist={() =>
                                        onAddingWishlist(
                                            uid,
                                            (item as Product).id
                                        )
                                    }
                                    onAddingCart={() =>
                                        onAddingCart(uid, (item as Product).id)
                                    }
                                />
                            );
                        })}
                    </div>
                ) : (
                    <div className="wishlist__main">
                        {currentItems.map((item) => {
                            return (
                                <WishlistItem
                                    key={item.id}
                                    item={item as Item}
                                />
                            );
                        })}
                    </div>
                )
            ) : null}
            <div style={{ display: "flex", justifyContent: "center" }}>
                <ReactPaginate
                    className="shops__container__main__pagination__items"
                    breakLabel="..."
                    nextLabel="Next"
                    onPageChange={handlePageClick}
                    pageRangeDisplayed={5}
                    pageCount={pageCount}
                    previousLabel="Previous"
                    renderOnZeroPageCount={null}
                />
            </div>
            <ToastContainer
                className="p-3"
                position="bottom-end"
                style={{
                    zIndex: 1,
                    position: "fixed",
                    bottom: 0,
                    right: 0,
                }}
            >
                <Toast show={show} onClose={toggleShow} delay={3000} autohide>
                    <Toast.Header>
                        <strong className="me-auto">DIGITAL-E</strong>
                        <small>Just now</small>
                    </Toast.Header>
                    <Toast.Body>{msg}</Toast.Body>
                </Toast>
            </ToastContainer>
        </div>
    );
};

export default PaginatedItems;
