import React, { useEffect, useState } from "react";
import ReactPaginate from "react-paginate";
import axios from "../../api/axios";
import { useToast } from "../../context/ToastContext";
import { Product } from "../../utils/interface";
import ShopsItem from "./ShopsItem";
import WishlistItem from "./WishlistItem";

interface Item {
    id: number;
    product: Product;
}

type PaginatedProps = {
    itemsPerPage: number;
    items: Product[] | Item[];
    uid: string;
    wishlist: Item[];
    isWishlistPage: boolean; // Add this prop
};

const PaginatedItems = ({ itemsPerPage, items, uid, wishlist, isWishlistPage }: PaginatedProps) => {
    const { addToast } = useToast();
    const [currentWishlist, setCurrentWishlist] = useState<Item[]>([]);
    const [itemOffset, setItemOffset] = useState(0);

    useEffect(() => {
        if (wishlist.length > 0) {
            setCurrentWishlist(wishlist);
        }
    }, [wishlist]);

    const handleAddingWishlist = async (user_id: string, product_id: number) => {
        if (uid === "") {
            addToast("Login required", "You need to login to use this feature.");
            return;
        }
        try {
            if (currentWishlist.some((item) => item.product.id === product_id)) {
                const response = await axios.post(`/api/wishlist/delete/`, {
                    uid: user_id,
                    pid: product_id,
                });
                if (response.status === 200) {
                    console.log(response.data.msg);
                    setCurrentWishlist((prevWishlist) => prevWishlist.filter((item) => item.product.id !== product_id));
                    addToast("Remove wishlist item", "Item removed from wishlist successfully");
                }
            } else {
                const response = await axios.post("/api/wishlist/", {
                    uid: user_id,
                    pid: product_id,
                });
                if (response.status === 200) {
                    console.log(response.data.msg);
                    const newProduct = (items as Product[]).filter((product) => product.id === product_id)[0];
                    setCurrentWishlist((list) => [
                        ...list,
                        {
                            id: product_id,
                            product: newProduct,
                        },
                    ]);
                    addToast("Add wishlist item", "Item added to wishlist successfully");
                }
            }
        } catch (err) {
            console.error(err);
        }
    };

    const handleRemoveWishlist = async (user_id: string, product_id: number) => {
        try {
            const response = await axios.post(`/api/wishlist/delete/`, {
                uid: user_id,
                pid: product_id,
            });
            if (response.status === 200) {
                console.log(response.data.msg);
                addToast("Remove wishlist item", "Item removed from wishlist successfully.");
                setCurrentWishlist((prevWishlist) => prevWishlist.filter((item) => item.product.id !== product_id));
            }
        } catch (err) {
            console.error(err);
        }
    };

    const handleAddingCart = async (user_id: string, product_id: number) => {
        if (uid === "") {
            addToast("Login required", "You need to login to use this feature.");
            return;
        }

        try {
            const response = await axios.post("/api/cart/", {
                uid: user_id,
                pid: product_id,
                quantity: 1,
            });
            if (response.status === 200) {
                console.log(response.data.msg);
                addToast("Add cart item", "Product added to cart successfully");
            }
        } catch (err) {
            console.error(err);
        }
    };

    const handlePageClick = (event: any) => {
        const newOffset = (event.selected * itemsPerPage) % items.length;
        console.log(`User requested page number ${event.selected}, which is offset ${newOffset}`);
        setItemOffset(newOffset);
    };

    const endOffset = itemOffset + itemsPerPage;
    const currentItems = items.slice(itemOffset, endOffset);
    const pageCount = Math.ceil(items.length / itemsPerPage);
    const wishlistPageCount = Math.ceil(currentWishlist.length / itemsPerPage);

    return (
        <div className="shops__container__main__pagination">
            {currentItems.length > 0 ? (
                !isWishlistPage ? (
                    <div className="shops__container__main__pagination__list">
                        {currentItems.map((item) => {
                            return (
                                <ShopsItem
                                    key={item.id}
                                    product={item as Product}
                                    uid={uid}
                                    isWishlist={currentWishlist.some(
                                        (wishlistProduct) => wishlistProduct.product.id === (item as Product).id
                                    )}
                                    onAddingWishlist={handleAddingWishlist}
                                    onAddingCart={handleAddingCart}
                                />
                            );
                        })}
                    </div>
                ) : (
                    <div className="wishlist__main">
                        {currentWishlist.slice(itemOffset, endOffset).map((item) => {
                            return (
                                <WishlistItem
                                    key={item.id}
                                    item={item as Item}
                                    uid={uid}
                                    onRemoveWishlist={handleRemoveWishlist}
                                    onAddingCart={handleAddingCart}
                                />
                            );
                        })}
                    </div>
                )
            ) : (
                <div
                    style={{
                        display: "flex",
                        justifyContent: "center",
                        alignItems: "center",
                        height: "400px",
                    }}
                >
                    <strong style={{ fontSize: "1.5rem" }}>
                        {isWishlistPage
                            ? "There is no product in your wishlist"
                            : "There is no product matched the filters"}
                    </strong>
                </div>
            )}
            <div style={{ display: "flex", justifyContent: "center" }}>
                <ReactPaginate
                    className="shops__container__main__pagination__items"
                    breakLabel="..."
                    nextLabel="Next"
                    onPageChange={handlePageClick}
                    pageRangeDisplayed={5}
                    pageCount={
                        currentItems.length !== 0 && !("product" in currentItems[0]) ? pageCount : wishlistPageCount
                    }
                    previousLabel="Previous"
                    ariaLabelBuilder={(index) => `Page-${index}`}
                    renderOnZeroPageCount={null}
                />
            </div>
        </div>
    );
};

export default PaginatedItems;
