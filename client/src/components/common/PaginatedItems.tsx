import React, { useCallback, useEffect, useMemo, useOptimistic, useState } from "react";
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

type WishlistMutation =
    | { type: "add"; item: Item }
    | { type: "remove"; productId: number };

const applyWishlistMutation = (wishlist: Item[], mutation: WishlistMutation): Item[] => {
    if (mutation.type === "remove") {
        return wishlist.filter((item) => item.product.id !== mutation.productId);
    }

    if (wishlist.some((item) => item.product.id === mutation.item.product.id)) {
        return wishlist;
    }

    return [...wishlist, mutation.item];
};

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
    const [baseWishlist, setBaseWishlist] = useState<Item[]>([]);
    const [pendingWishlistIds, setPendingWishlistIds] = useState<number[]>([]);
    const [itemOffset, setItemOffset] = useState(0);
    const [optimisticWishlist, applyOptimisticWishlist] = useOptimistic(
        baseWishlist,
        (currentWishlist: Item[], mutation: WishlistMutation) => applyWishlistMutation(currentWishlist, mutation),
    );

    useEffect(() => {
        setBaseWishlist(wishlist);
    }, [wishlist]);

    useEffect(() => {
        setItemOffset(0);
    }, [items]);

    const wishlistIdSet = useMemo(() => {
        return new Set(optimisticWishlist.map((item) => item.product.id));
    }, [optimisticWishlist]);
    const pendingWishlistIdSet = useMemo(() => new Set(pendingWishlistIds), [pendingWishlistIds]);

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

    const buildWishlistItem = useCallback(
        (productId: number) => {
            const product = productById.get(productId);
            return product
                ? {
                      id: productId,
                      product,
                  }
                : null;
        },
        [productById],
    );

    const toggleWishlist = useCallback(async (user_id: string, product_id: number) => {
        if (uid === "") {
            addToast("Login required", "You need to login to use this feature.");
            return;
        }

        if (pendingWishlistIdSet.has(product_id)) {
            return;
        }

        const exists = wishlistIdSet.has(product_id);
        const optimisticItem = buildWishlistItem(product_id);
        const mutation: WishlistMutation | null = exists
            ? { type: "remove", productId: product_id }
            : optimisticItem
              ? { type: "add", item: optimisticItem }
              : null;

        setPendingWishlistIds((prev) => [...prev, product_id]);
        if (mutation) {
            applyOptimisticWishlist(mutation);
        }
        addToast(
            exists ? "Wishlist updated" : "Wishlist updated",
            exists ? "Item removed from wishlist." : "Item added to wishlist.",
        );

        try {
            if (exists) {
                const response = await axios.delete(`/api/wishlist/${product_id}/`, {
                    data: {
                        uid: user_id,
                    },
                });
                if (response.status !== 200) {
                    throw new Error("Wishlist delete failed");
                }
                if (mutation) {
                    setBaseWishlist((prevWishlist) => applyWishlistMutation(prevWishlist, mutation));
                }
            } else {
                const response = await axios.post("/api/wishlist/", {
                    uid: user_id,
                    pid: product_id,
                });
                if (response.status !== 200) {
                    throw new Error("Wishlist add failed");
                }
                if (mutation) {
                    setBaseWishlist((prevWishlist) => applyWishlistMutation(prevWishlist, mutation));
                }
            }
        } catch {
            addToast("Wishlist", "Unable to update wishlist.");
        } finally {
            setPendingWishlistIds((prev) => prev.filter((id) => id !== product_id));
        }
    }, [addToast, applyOptimisticWishlist, buildWishlistItem, pendingWishlistIdSet, uid, wishlistIdSet]);

    const handleRemoveWishlist = useCallback(async (user_id: string, product_id: number) => {
        try {
            const response = await axios.delete(`/api/wishlist/${product_id}`, {
                data: {
                    uid: user_id,
                },
            });
            if (response.status === 200) {
                addToast("Remove wishlist item", "Item removed from wishlist successfully.");
                setBaseWishlist((prevWishlist) => prevWishlist.filter((item) => item.product.id !== product_id));
            }
        } catch {
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
        } catch {
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
        () => Math.ceil(optimisticWishlist.length / itemsPerPage),
        [optimisticWishlist.length, itemsPerPage]
    );
    const pageCountToUse = isWishlistPage ? wishlistPageCount : pageCount;

    return (
        <div className="shops__products">
            {currentItems.length > 0 ? (
                !isWishlistPage ? (
                    <div className="shops__list">
                        {currentItems.map((item) => {
                            const product = "product" in item ? item.product : item;
                            return (
                                <ShopsItem
                                    key={product.id}
                                    product={product}
                                    uid={uid}
                                    isWishlist={wishlistIdSet.has(product.id)}
                                    isWishlistPending={pendingWishlistIdSet.has(product.id)}
                                    onToggleWishlist={toggleWishlist}
                                    onAddingCart={handleAddingCart}
                                />
                            );
                        })}
                    </div>
                ) : (
                    <div className="wishlist__main">
                        {optimisticWishlist.slice(itemOffset, endOffset).map((item) => {
                            return (
                                <WishlistItem
                                    key={item.id}
                                    item={item as Item}
                                    selected={false}
                                    onSelect={() => {}}
                                    onRemoveWishlist={(productId) => handleRemoveWishlist(uid, productId)}
                                    onMoveToCart={(product) => handleAddingCart(uid, product.id)}
                                />
                            );
                        })}
                    </div>
                )
            ) : (
                <div className="shops__empty app-empty-state">
                    <strong>
                        {isWishlistPage
                            ? "There is no product in your wishlist"
                            : "There is no product matched the filters"}
                    </strong>
                    {!isWishlistPage ? (
                        <p>Try adjusting your search term, brand selection, or price range.</p>
                    ) : null}
                </div>
            )}
            {pageCountToUse > 1 ? (
                <div className="shops__pagination-wrap">
                    <ReactPaginate
                        className="shops__pagination"
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
            ) : null}
        </div>
    );
};

export default PaginatedItems;
