import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import EmptyState from "../components/common/EmptyState";
import LoadingScreen from "../components/common/LoadingScreen";
import WishlistItem from "../components/common/WishlistItem";
import ConfirmActionModal from "../components/common/ConfirmActionModal";
import Layout from "../components/layout/Layout";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { useT } from "../hooks/useT";
import { useWishlistCopy } from "../hooks/useWishlistCopy";
import { HeartFillIcon } from "../components/common/Icons";
import "../styles/pages/_wishlist.scss";
import { Product } from "../utils/interface";
import type { Wishlist } from "../types/product";
import { addItemsToCustomerCart } from "../features/orders/api";
import { fetchWishlist as fetchUserWishlist, removeFromWishlist, removeWishlistItems } from "../features/products/api";
import { fetchProductAlerts, updateProductAlert } from "../features/productAlerts/api";
import type { ProductAlertKey, ProductAlertPreference } from "../features/productAlerts/types";

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
    const [alertPreferencesLoaded, setAlertPreferencesLoaded] = useState(false);
    const [isLoadingAlertPreferences, setIsLoadingAlertPreferences] = useState(false);
    const { userData } = useAuth();
    const uid = userData?.id || "";
    const { addToast } = useToast();
    const t = useT();
    const copy = useWishlistCopy();

    const loadAlertPreferences = useCallback(async () => {
        if (!uid) {
            setAlertLoadError(null);
            setAlertPreferencesLoaded(true);
            setIsLoadingAlertPreferences(false);
            return;
        }

        setAlertPreferencesLoaded(false);
        setIsLoadingAlertPreferences(true);
        try {
            const preferences = await fetchProductAlerts(uid);
            setAlertPreferences(preferences.reduce<Record<number, ProductAlertPreference>>((accumulator, preference) => {
                accumulator[preference.productId] = preference;
                return accumulator;
            }, {}));
            setAlertLoadError(null);
            setAlertPreferencesLoaded(true);
        } catch {
            setAlertLoadError(t("wishlistAlerts.loadError"));
        } finally {
            setIsLoadingAlertPreferences(false);
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
                setWishlist(await fetchUserWishlist(uid));
            } catch {
                addToast(copy.toastTitle, copy.loadError, "error");
            } finally {
                setIsLoadingWishlist(false);
            }
        };
        fetchWishlist();
    }, [addToast, copy, t, uid]);

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
            await removeFromWishlist(uid, productId);
            setWishlist((currentWishlist) => currentWishlist.filter((item) => item.product.id !== productId));
            setSelectedIds((currentIds) => currentIds.filter((id) => id !== productId));
            addToast(copy.toastTitle, copy.removed, "success");
            setPendingRemoveProductId(null);
        } catch {
            addToast(copy.toastTitle, copy.removeError, "error");
        } finally {
            setIsRemoving(false);
        }
    };

    const handleRemoveWishlist = (productId: number) => {
        setPendingRemoveProductId(productId);
    };

    const handleAlertToggle = async (productId: number, key: ProductAlertKey, enabled: boolean) => {
        if (!uid || !alertPreferencesLoaded || alertSavingByProductId[productId]) return;

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
            addToast(copy.toastTitle, copy.selectAtLeastOne, "info");
            return;
        }

        try {
            setIsRemoving(true);
            await removeWishlistItems(uid, selectedIds);
            setWishlist((currentWishlist) => currentWishlist.filter((item) => !selectedIds.includes(item.product.id)));
            setSelectedIds([]);
            addToast(copy.toastTitle, copy.removedSelected, "success");
            setShowBulkRemoveConfirm(false);
        } catch {
            addToast(copy.toastTitle, copy.removeSelectedError, "error");
        } finally {
            setIsRemoving(false);
        }
    };

    const handleMoveToCart = async (product: Product) => {
        if (product.stock <= 0) {
            addToast(copy.toastTitle, copy.productOutOfStock, "info");
            return;
        }

        try {
            await addItemsToCustomerCart(uid, [{ productId: product.id, quantity: 1, stock: product.stock }]);
            setSelectedIds((currentIds) => currentIds.filter((id) => id !== product.id));
            addToast(copy.toastTitle, copy.productAddedToCart, "success");
        } catch {
            addToast(copy.toastTitle, copy.moveToCartError, "error");
        }
    };

    const handleMoveSelectedToCart = async () => {
        const availableSelected = selectedProducts.filter((item) => item.product.stock > 0);
        if (availableSelected.length === 0) {
            addToast(copy.toastTitle, copy.selectedOutOfStock, "info");
            return;
        }

        try {
            await addItemsToCustomerCart(uid, availableSelected.map((item) => ({
                productId: item.product.id,
                quantity: 1,
                stock: item.product.stock,
            })));
            const movedIds = availableSelected.map((item) => item.product.id);
            setSelectedIds((currentIds) => currentIds.filter((id) => !movedIds.includes(id)));
            addToast(copy.toastTitle, copy.selectedAddedToCart, "success");
        } catch {
            addToast(copy.toastTitle, copy.moveSelectedError, "error");
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
                <title>{`${copy.title} | Digital-E`}</title>
                <meta
                    name="description"
                    content={copy.metaDescription}
                />
            </Helmet>
            <main className="wishlist app-page">
                <header className="wishlist__header">
                    <div>
                        <h1>{copy.title}</h1>
                    </div>
                    <div className="wishlist__summary app-card">
                        <article>
                            <span>{copy.saved}</span>
                            <strong>{wishlist.length}</strong>
                        </article>
                        <article>
                            <span>{copy.selected}</span>
                            <strong>{selectedIds.length}</strong>
                        </article>
                        <article>
                            <span>{copy.available}</span>
                            <strong>{wishlist.filter((item) => item.product.stock > 0).length}</strong>
                        </article>
                    </div>
                </header>

                {wishlist.length > 0 ? (
                    <section className="wishlist__toolbar app-card" aria-label={copy.bulkActions}>
                        <div className="wishlist__toolbar__copy">
                            <strong>{copy.savedCount(wishlist.length)}</strong>
                        </div>
                        <div className="wishlist__actions">
                            <button type="button" onClick={handleSelectAll}>
                                {selectedIds.length === wishlist.length ? copy.clearSelection : copy.selectAll}
                            </button>
                            <button type="button" onClick={handleMoveSelectedToCart} disabled={selectedIds.length === 0}>
                                {copy.moveSelected}
                            </button>
                            <button
                                type="button"
                                className="danger"
                                onClick={() => setShowBulkRemoveConfirm(true)}
                                disabled={selectedIds.length === 0}
                            >
                                {copy.removeSelected}
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
                        title={copy.emptyTitle}
                        description={copy.emptyDescription}
                        actionLabel={copy.browseProducts}
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
                                alertPreferencesLoaded={alertPreferencesLoaded}
                                alertPreferencesLoading={isLoadingAlertPreferences}
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
                    title={copy.removeItemTitle}
                    message={copy.removeItemMessage(wishlist.find((item) => item.product.id === pendingRemoveProductId)?.product.name || copy.unknownProduct)}
                    confirmLabel={copy.remove}
                    cancelLabel={copy.cancel}
                    processingLabel={copy.processing}
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
                    title={copy.removeSelectedTitle}
                    message={copy.removeSelectedMessage(selectedIds.length)}
                    confirmLabel={copy.removeSelected}
                    cancelLabel={copy.cancel}
                    processingLabel={copy.processing}
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
