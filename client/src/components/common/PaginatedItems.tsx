import React, { useCallback, useEffect, useMemo, useState } from "react";
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
    serverSide?: boolean;
    totalItems?: number;
    currentPage?: number;
    onPageChange?: (page: number) => void;
};

const PaginatedItems = ({
    itemsPerPage,
    items,
    uid,
    wishlist,
    isWishlistPage,
    serverSide = false,
    totalItems,
    currentPage,
    onPageChange,
}: PaginatedProps) => {
    const { addToast } = useToast();
    const [currentWishlist, setCurrentWishlist] = useState<Item[]>([]);
    const [itemOffset, setItemOffset] = useState(0);

    useEffect(() => {
        setCurrentWishlist(wishlist);
        setItemOffset(0);
    }, [wishlist]);

    useEffect(() => {
        setItemOffset(0);
    }, [items.length]);

    const wishlistIdSet = useMemo(() => {
        return new Set(currentWishlist.map((item) => item.product.id));
    }, [currentWishlist]);

    const productById = useMemo(() => {
        const map = new Map<number, Product>();
        items.forEach((item) => {
            if ("product" in item) {
                map.set(item.product.id, item.product);
            } else {
                map.set(item.id, item);
            }
        });
        return map;
    }, [items]);

    const toggleWishlist = useCallback(async (user_id: string, product_id: number) => {
        if (uid === "") {
            addToast("Login required", "You need to login to use this feature.");
            return;
        }
        try {
            const exists = wishlistIdSet.has(product_id);
            if (exists) {
                const response = await axios.delete(`/api/wishlist/${product_id}/`, {
                    data: {
                        uid: user_id,
                    },
                });
                if (response.status === 200) {
                    setCurrentWishlist((prevWishlist) => prevWishlist.filter((item) => item.product.id !== product_id));
                    addToast("Remove wishlist item", "Item removed from wishlist successfully");
                }
            } else {
                const response = await axios.post("/api/wishlist/", {
                    uid: user_id,
                    pid: product_id,
                });
                if (response.status === 200) {
                    const newProduct = productById.get(product_id);
                    if (newProduct) {
                        setCurrentWishlist((list) => [
                            ...list,
                            {
                                id: product_id,
                                product: newProduct,
                            },
                        ]);
                    }
                    addToast("Add wishlist item", "Item added to wishlist successfully");
                }
            }
        } catch (err) {
            addToast("Wishlist", "Unable to update wishlist.");
        }
    }, [addToast, productById, uid, wishlistIdSet]);

    const handleRemoveWishlist = useCallback(async (user_id: string, product_id: number) => {
        try {
            const response = await axios.delete(`/api/wishlist/${product_id}`, {
                data: {
                    uid: user_id,
                },
            });
            if (response.status === 200) {
                addToast("Remove wishlist item", "Item removed from wishlist successfully.");
                setCurrentWishlist((prevWishlist) => prevWishlist.filter((item) => item.product.id !== product_id));
            }
        } catch (err) {
            addToast("Wishlist", "Unable to remove wishlist item.");
        }
    }, [addToast]);

    const handleAddingCart = useCallback(async (user_id: string, product_id: number) => {
        if (uid === "") {
            addToast("Login required", "You need to login to use this feature.");
            return;
        }

        try {
            const product = productById.get(product_id);
            const stock = product ? product.stock : 0;
            if (stock <= 0) {
                addToast("Out of stock", "This product is out of stock.");
                return;
            }
            const response = await axios.post("/api/cart/", {
                uid: user_id,
                pid: product_id,
                quantity: 1,
            });
            if (response.status === 200) {
                addToast("Add cart item", "Product added to cart successfully");
            }
        } catch (err) {
            addToast("Add cart item", "Unable to add item to cart.");
        }
    }, [addToast, productById, uid]);

    const handlePageClick = useCallback((event: { selected: number }) => {
        if (serverSide && onPageChange) {
            onPageChange(event.selected + 1);
            return;
        }
        const newOffset = (event.selected * itemsPerPage) % items.length;
        setItemOffset(newOffset);
    }, [items.length, itemsPerPage, onPageChange, serverSide]);

    const endOffset = itemOffset + itemsPerPage;
    const currentItems = useMemo(
        () => (serverSide ? items : items.slice(itemOffset, endOffset)),
        [endOffset, itemOffset, items, serverSide],
    );
    const pageCount = useMemo(() => {
        if (serverSide) {
            const total = totalItems ?? items.length;
            return Math.ceil(total / itemsPerPage);
        }
        return Math.ceil(items.length / itemsPerPage);
    }, [items.length, itemsPerPage, serverSide, totalItems]);
    const wishlistPageCount = useMemo(
        () => Math.ceil(currentWishlist.length / itemsPerPage),
        [currentWishlist.length, itemsPerPage]
    );
    const pageCountToUse = isWishlistPage ? wishlistPageCount : pageCount;

    return (
        <div className="shops__container__main__pagination">
            {currentItems.length > 0 ? (
                !isWishlistPage ? (
                    <div className="shops__container__main__pagination__list">
                        {currentItems.map((item) => {
                            const product = "product" in item ? item.product : item;
                            return (
                                <ShopsItem
                                    key={product.id}
                                    product={product}
                                    uid={uid}
                                    isWishlist={wishlistIdSet.has(product.id)}
                                    onToggleWishlist={toggleWishlist}
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
                    pageClassName="pagination__item"
                    pageLinkClassName="pagination__link"
                    previousClassName="pagination__item"
                    nextClassName="pagination__item"
                    breakClassName="pagination__item"
                    activeClassName="selected"
                    disabledClassName="disabled"
                    breakLabel="..."
                    nextLabel="Next"
                    onPageChange={handlePageClick}
                    pageRangeDisplayed={5}
                    pageCount={pageCountToUse}
                    previousLabel="Previous"
                    forcePage={serverSide && currentPage ? currentPage - 1 : undefined}
                    ariaLabelBuilder={(index) => `Page-${index}`}
                    renderOnZeroPageCount={null}
                />
            </div>
        </div>
    );
};

export default PaginatedItems;
