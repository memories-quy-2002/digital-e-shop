import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import axios from "../api/axios";
import EmptyState from "../components/common/EmptyState";
import LoadingScreen from "../components/common/LoadingScreen";
import WishlistItem from "../components/common/WishlistItem";
import ConfirmActionModal from "../components/common/ConfirmActionModal";
import Layout from "../components/layout/Layout";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { useT } from "../hooks/useT";
import { HeartFillIcon } from "../components/common/Icons";
import "../styles/pages/_wishlist.scss";
import { Product } from "../utils/interface";
import { fetchProductAlerts, updateProductAlert } from "../features/productAlerts/api";
import type { ProductAlertKey, ProductAlertPreference } from "../features/productAlerts/types";

interface Wishlist {
    id: number;
    product: Product;
}

const WishlistPage = () => {
    const [wishlist, setWishlist] = useState<Wishlist[]>([]);
    const [isLoadingWishlist, setIsLoadingWishlist] = useState(true);
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const [pendingRemoveProductId, setPendingRemoveProductId] = useState<number | null>(null);
    const [showBulkRemoveConfirm, setShowBulkRemoveConfirm] = useState(false);
    const [isRemoving, setIsRemoving] = useState(false);
    const [alertPreferences, setAlertPreferences] = useState<Record<number, ProductAlertPreference>>({});
    const [alertSavingByProductId, setAlertSavingByProductId] = useState<Record<number, boolean>>({});
    const [alertSavedByProductId, setAlertSavedByProductId] = useState<Record<number, boolean>>({});
    const [alertErrors, setAlertErrors] = useState<Record<number, string | null>>({});
    const [alertLoadError, setAlertLoadError] = useState<string | null>(null);
    const { userData } = useAuth();
    const uid = userData?.id || "";
    const { addToast } = useToast();
    const t = useT();

    const loadAlertPreferences = useCallback(async () => {
        if (!uid) {
            setAlertLoadError(null);
            return;
        }

        try {
            const preferences = await fetchProductAlerts(uid);
            setAlertPreferences(preferences.reduce<Record<number, ProductAlertPreference>>((accumulator, preference) => {
                accumulator[preference.productId] = preference;
                return accumulator;
            }, {}));
            setAlertLoadError(null);
        } catch {
            setAlertLoadError(t("wishlistAlerts.loadError"));
        }
    }, [t, uid]);

    useEffect(() => {
        const fetchWishlist = async () => {
            if (!uid) {
                setIsLoadingWishlist(false);
                return;
            }

            try {
                setIsLoadingWishlist(true);
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
            } finally {
                setIsLoadingWishlist(false);
            }
        };
        fetchWishlist();
    }, [addToast, uid]);

    useEffect(() => {
        void loadAlertPreferences();
    }, [loadAlertPreferences]);

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

    const handleAlertToggle = async (productId: number, key: ProductAlertKey, enabled: boolean) => {
        if (!uid || alertSavingByProductId[productId]) return;

        const previousPreference = alertPreferences[productId] || {
            productId,
            priceDropEnabled: false,
            backInStockEnabled: false,
        };
        const nextPreference = { ...previousPreference, [key]: enabled } satisfies ProductAlertPreference;

        setAlertPreferences((current) => ({ ...current, [productId]: nextPreference }));
        setAlertErrors((current) => ({ ...current, [productId]: null }));
        setAlertSavedByProductId((current) => ({ ...current, [productId]: false }));
        setAlertSavingByProductId((current) => ({ ...current, [productId]: true }));

        try {
            const savedPreference = await updateProductAlert(uid, productId, {
                priceDropEnabled: nextPreference.priceDropEnabled,
                backInStockEnabled: nextPreference.backInStockEnabled,
            });
            setAlertPreferences((current) => ({ ...current, [productId]: savedPreference }));
            setAlertSavedByProductId((current) => ({ ...current, [productId]: true }));
        } catch {
            setAlertPreferences((current) => ({ ...current, [productId]: previousPreference }));
            setAlertSavedByProductId((current) => ({ ...current, [productId]: false }));
            setAlertErrors((current) => ({
                ...current,
                [productId]: t("wishlistAlerts.updateError"),
            }));
        } finally {
            setAlertSavingByProductId((current) => ({ ...current, [productId]: false }));
        }
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
                setSelectedIds((currentIds) => currentIds.filter((id) => id !== product.id));
                addToast("Wishlist", "Product added to cart.");
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
            setSelectedIds((currentIds) => currentIds.filter((id) => !movedIds.includes(id)));
            addToast("Wishlist", "Available selected products added to cart.");
        } catch {
            addToast("Wishlist", "Unable to move selected products to cart.");
        }
    };

    if (isLoadingWishlist) {
        return (
            <Layout>
                <LoadingScreen variant="page" />
            </Layout>
        );
    }

    return (
        <Layout>
            <Helmet>
                <title>Your Wishlist | Digital-E</title>
                <meta
                    name="description"
                    content="Save products you love and quickly add them to your cart when you're ready."
                />
            </Helmet>
            <main className="wishlist app-page">
                <header className="wishlist__header">
                    <div>
                        <h1>Wishlist</h1>
                    </div>
                    <div className="wishlist__summary app-card">
                        <article>
                            <span>Saved</span>
                            <strong>{wishlist.length}</strong>
                        </article>
                        <article>
                            <span>Selected</span>
                            <strong>{selectedIds.length}</strong>
                        </article>
                        <article>
                            <span>Available</span>
                            <strong>{wishlist.filter((item) => item.product.stock > 0).length}</strong>
                        </article>
                    </div>
                </header>

                {wishlist.length > 0 ? (
                    <section className="wishlist__toolbar app-card" aria-label="Wishlist bulk actions">
                        <div className="wishlist__toolbar__copy">
                            <strong>{wishlist.length} saved</strong>
                        </div>
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
                    </section>
                ) : null}

                {alertLoadError ? (
                    <div className="wishlist__alerts-error" role="alert">
                        <span>{alertLoadError}</span>
                        <button type="button" onClick={() => void loadAlertPreferences()}>
                            {t("wishlistAlerts.retry")}
                        </button>
                    </div>
                ) : null}

                {wishlist.length === 0 ? (
                    <EmptyState
                        className="wishlist__empty"
                        icon={<HeartFillIcon size={20} />}
                        title="Your wishlist is empty"
                        actionLabel="Browse products"
                        actionTo="/shops"
                    />
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
                                alertPreference={alertPreferences[item.product.id]}
                                alertSaving={Boolean(alertSavingByProductId[item.product.id])}
                                alertSaved={Boolean(alertSavedByProductId[item.product.id])}
                                alertError={alertErrors[item.product.id]}
                                onAlertToggle={handleAlertToggle}
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
