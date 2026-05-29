import React, { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet";
import axios from "../api/axios";
import WishlistItem from "../components/common/WishlistItem";
import ConfirmActionModal from "../components/common/ConfirmActionModal";
import Layout from "../components/layout/Layout";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import "../styles/WishlistPage.scss";
import { Product } from "../utils/interface";

interface Wishlist {
    id: number;
    product: Product;
}

const WishlistPage = () => {
    const [wishlist, setWishlist] = useState<Wishlist[]>([]);
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const [pendingRemoveProductId, setPendingRemoveProductId] = useState<number | null>(null);
    const [showBulkRemoveConfirm, setShowBulkRemoveConfirm] = useState(false);
    const [isRemoving, setIsRemoving] = useState(false);
    const { userData } = useAuth();
    const uid = userData?.id || "";
    const { addToast } = useToast();

    useEffect(() => {
        const fetchWishlist = async () => {
            if (!uid) return;

            try {
                const response = await axios.get(`/api/wishlist/${uid}`);
                if (response.status === 200) {
                    const newWishlist: Wishlist[] = response.data.wishlist.map((item: any) => {
                        const { id, product_id, ...productProps } = item;

                        return {
                            id,
                            product: {
                                id: product_id,
                                ...productProps,
                                price: Number(productProps.price) || 0,
                                sale_price: productProps.sale_price === null ? null : Number(productProps.sale_price) || null,
                                stock: Number(productProps.stock) || 0,
                            },
                        };
                    });

                    setWishlist(newWishlist);
                }
            } catch {
                addToast("Wishlist", "Unable to load wishlist.");
            }
        };
        fetchWishlist();
    }, [addToast, uid]);

    const selectedProducts = useMemo(() => wishlist.filter((item) => selectedIds.includes(item.product.id)), [selectedIds, wishlist]);

    const handleSelect = (productId: number, checked: boolean) => {
        setSelectedIds((currentIds) => (checked ? [...currentIds, productId] : currentIds.filter((id) => id !== productId)));
    };

    const handleSelectAll = () => {
        if (selectedIds.length === wishlist.length) {
            setSelectedIds([]);
            return;
        }

        setSelectedIds(wishlist.map((item) => item.product.id));
    };

    const handleConfirmRemoveWishlist = async (productId: number) => {
        try {
            setIsRemoving(true);
            const response = await axios.delete(`/api/wishlist/${productId}`, {
                data: { uid },
            });
            if (response.status === 200) {
                setWishlist((currentWishlist) => currentWishlist.filter((item) => item.product.id !== productId));
                setSelectedIds((currentIds) => currentIds.filter((id) => id !== productId));
                addToast("Wishlist", "Item removed from wishlist.");
                setPendingRemoveProductId(null);
            }
        } catch {
            addToast("Wishlist", "Unable to remove wishlist item.");
        } finally {
            setIsRemoving(false);
        }
    };

    const handleRemoveWishlist = (productId: number) => {
        setPendingRemoveProductId(productId);
    };

    const handleBulkRemove = async () => {
        if (selectedIds.length === 0) {
            addToast("Wishlist", "Select at least one wishlist item.");
            return;
        }

        try {
            setIsRemoving(true);
            const response = await axios.delete("/api/wishlist/", {
                data: { uid, productIds: selectedIds },
            });
            if (response.status === 200) {
                setWishlist((currentWishlist) => currentWishlist.filter((item) => !selectedIds.includes(item.product.id)));
                setSelectedIds([]);
                addToast("Wishlist", "Selected wishlist items were removed.");
                setShowBulkRemoveConfirm(false);
            }
        } catch {
            addToast("Wishlist", "Unable to remove selected items.");
        } finally {
            setIsRemoving(false);
        }
    };

    const handleMoveToCart = async (product: Product) => {
        if (product.stock <= 0) {
            addToast("Wishlist", "This product is out of stock.");
            return;
        }

        try {
            const response = await axios.post("/api/cart/", {
                uid,
                pid: product.id,
                quantity: 1,
            });
            if (response.status === 200) {
                await handleRemoveWishlist(product.id);
                addToast("Wishlist", "Product moved to cart.");
            }
        } catch {
            addToast("Wishlist", "Unable to move product to cart.");
        }
    };

    const handleMoveSelectedToCart = async () => {
        const availableSelected = selectedProducts.filter((item) => item.product.stock > 0);
        if (availableSelected.length === 0) {
            addToast("Wishlist", "Selected products are out of stock.");
            return;
        }

        try {
            await Promise.all(
                availableSelected.map((item) =>
                    axios.post("/api/cart/", {
                        uid,
                        pid: item.product.id,
                        quantity: 1,
                    }),
                ),
            );
            const movedIds = availableSelected.map((item) => item.product.id);
            await axios.delete("/api/wishlist/", {
                data: { uid, productIds: movedIds },
            });
            setWishlist((currentWishlist) => currentWishlist.filter((item) => !movedIds.includes(item.product.id)));
            setSelectedIds([]);
            addToast("Wishlist", "Available selected products moved to cart.");
        } catch {
            addToast("Wishlist", "Unable to move selected products to cart.");
        }
    };

    return (
        <Layout>
            <Helmet>
                <title>Your Wishlist | Digital-E</title>
                <meta
                    name="description"
                    content="Save products you love and quickly add them to your cart when you're ready."
                />
            </Helmet>
            <main className="wishlist">
                <header className="wishlist__header">
                    <div>
                        <span>Saved products</span>
                        <h1>My Wishlist</h1>
                        <p>Watch sale prices, stock changes, and move ready-to-buy items into your cart.</p>
                    </div>
                    {wishlist.length > 0 ? (
                        <div className="wishlist__actions">
                            <button type="button" onClick={handleSelectAll}>
                                {selectedIds.length === wishlist.length ? "Clear selection" : "Select all"}
                            </button>
                            <button type="button" onClick={handleMoveSelectedToCart} disabled={selectedIds.length === 0}>
                                Move selected
                            </button>
                            <button
                                type="button"
                                className="danger"
                                onClick={() => setShowBulkRemoveConfirm(true)}
                                disabled={selectedIds.length === 0}
                            >
                                Remove selected
                            </button>
                        </div>
                    ) : null}
                </header>

                {wishlist.length === 0 ? (
                    <div className="wishlist__empty">Your wishlist is empty.</div>
                ) : (
                    <section className="wishlist__main">
                        {wishlist.map((item) => (
                            <WishlistItem
                                key={item.id}
                                item={item}
                                selected={selectedIds.includes(item.product.id)}
                                onSelect={handleSelect}
                                onMoveToCart={handleMoveToCart}
                                onRemoveWishlist={handleRemoveWishlist}
                            />
                        ))}
                    </section>
                )}
                <ConfirmActionModal
                    show={pendingRemoveProductId !== null}
                    title="Remove wishlist item"
                    message={`Remove "${
                        wishlist.find((item) => item.product.id === pendingRemoveProductId)?.product.name || "this product"
                    }" from your wishlist?`}
                    confirmLabel="Remove"
                    isConfirming={isRemoving}
                    onCancel={() => setPendingRemoveProductId(null)}
                    onConfirm={() => {
                        if (pendingRemoveProductId !== null) {
                            void handleConfirmRemoveWishlist(pendingRemoveProductId);
                        }
                    }}
                />
                <ConfirmActionModal
                    show={showBulkRemoveConfirm}
                    title="Remove selected items"
                    message={`Remove ${selectedIds.length} selected item${selectedIds.length === 1 ? "" : "s"} from your wishlist?`}
                    confirmLabel="Remove selected"
                    isConfirming={isRemoving}
                    onCancel={() => setShowBulkRemoveConfirm(false)}
                    onConfirm={() => {
                        void handleBulkRemove();
                    }}
                />
            </main>
        </Layout>
    );
};

export default WishlistPage;
