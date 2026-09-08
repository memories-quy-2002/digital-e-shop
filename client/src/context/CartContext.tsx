import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useAuth } from "./AuthContext";
import { useToast } from "./ToastContext";
import {
    addItemsToCustomerCart,
    applyCustomerDiscount,
    fetchCustomerCart,
    previewGuestCart,
    removeCustomerCartItem,
    updateCustomerCartItem,
    validateCustomerCart,
} from "../features/orders/api";
import {
    addGuestCartItem,
    normalizeCartQuantity,
    readGuestCart,
    removeGuestCartItem,
    replaceGuestCart,
    updateGuestCartItem,
    type GuestCartStorageItem,
} from "../features/orders/guestCartStorage";
import type { CartValidationIssue, CheckoutCartItem, GuestCartPreview } from "../features/orders/types";
import { getCartValidationMessage } from "../features/orders/types";

export type CartStatus = "loading" | "ready" | "empty" | "validation-error" | "error";
export type GuestCartMergeStatus = "idle" | "loading" | "complete" | "partial" | "error";

type DiscountResult = {
    status: "idle" | "success" | "error";
    title?: string;
    message?: string;
};

type CartMergeResult = {
    accepted: GuestCartStorageItem[];
    rejected: GuestCartStorageItem[];
    complete: boolean;
};

type CartMutation =
    | { type: "remove"; cartItemId: number }
    | { type: "updateQuantity"; cartItemId: number; quantity: number };

type CartSourceSnapshot = {
    source: string;
    uid: string | null;
    generation: number;
};

interface CartContextValue {
    items: CheckoutCartItem[];
    totalPrice: number;
    discount: number;
    discountCode: string | null;
    subtotal: number;
    validationIssues: CartValidationIssue[];
    status: CartStatus;
    error: string | null;
    isGuest: boolean;
    guestItems: GuestCartStorageItem[];
    hasGuestItems: boolean;
    mergeStatus: GuestCartMergeStatus;
    isLoading: boolean;
    isRemovingItem: boolean;
    pendingRemoveItem: CheckoutCartItem | null;
    fetchCart: () => Promise<boolean>;
    addItem: (productId: number, quantity?: number) => Promise<boolean>;
    updateQuantity: (itemId: number, quantity: number) => Promise<void>;
    removeItem: (item: CheckoutCartItem) => void;
    confirmRemoveItem: () => Promise<void>;
    cancelRemoveItem: () => void;
    applyDiscount: (code: string, price: number) => Promise<DiscountResult>;
    validateBeforeCheckout: () => Promise<boolean>;
    mergeGuestCart: () => Promise<CartMergeResult>;
    onValidationRefresh: (nextCart: CheckoutCartItem[], issues: CartValidationIssue[]) => void;
}

const CartContext = createContext<CartContextValue | null>(null);

const getErrorMessage = (error: unknown, fallback: string) => {
    if (error && typeof error === "object" && "response" in error) {
        const response = (error as { response?: { data?: { msg?: string; error?: string } } }).response;
        return response?.data?.msg || response?.data?.error || fallback;
    }
    return fallback;
};

const normalizeContextItems = (items: CheckoutCartItem[]) =>
    items.map((item) => ({ ...item, cartItemId: item.cartItemId > 0 ? item.cartItemId : item.productId }));

const calculateTotal = (items: CheckoutCartItem[]) =>
    items.reduce((total, item) => total + (item.sale_price || item.price) * item.quantity, 0);

const getPreviewDiscount = (preview: GuestCartPreview) => {
    const promotionDiscount = Number(preview.promotion?.discount);
    if (Number.isFinite(promotionDiscount) && promotionDiscount >= 0) return promotionDiscount;
    return Math.max(0, Number(preview.merchandiseTotal || 0) - Number(preview.totalPrice || 0));
};

const applyOptimisticMutation = (items: CheckoutCartItem[], mutation: CartMutation) => {
    if (mutation.type === "remove") return items.filter((item) => item.cartItemId !== mutation.cartItemId);
    return items.map((item) => item.cartItemId === mutation.cartItemId
        ? { ...item, quantity: mutation.quantity }
        : item);
};

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { userData, loading: authLoading } = useAuth();
    const { addToast } = useToast();
    const uid = userData?.id || null;
    const source = uid ? `user:${uid}` : "guest";

    const [items, setItems] = useState<CheckoutCartItem[]>([]);
    const [totalPrice, setTotalPrice] = useState(0);
    const [discount, setDiscount] = useState(0);
    const [discountCode, setDiscountCode] = useState<string | null>(null);
    const [validationIssues, setValidationIssues] = useState<CartValidationIssue[]>([]);
    const [status, setStatus] = useState<CartStatus>("loading");
    const [error, setError] = useState<string | null>(null);
    const [guestItems, setGuestItems] = useState<GuestCartStorageItem[]>([]);
    const [mergeStatus, setMergeStatus] = useState<GuestCartMergeStatus>("idle");
    const [isLoading, setIsLoading] = useState(true);
    const [isRemovingItem, setIsRemovingItem] = useState(false);
    const [pendingRemoveItem, setPendingRemoveItem] = useState<CheckoutCartItem | null>(null);
    const sourceRef = useRef<CartSourceSnapshot>({ source, uid, generation: 0 });
    const requestIdRef = useRef(0);
    const mergePromiseRef = useRef<Promise<CartMergeResult> | null>(null);

    const isCurrentSource = useCallback((candidate: CartSourceSnapshot) => {
        const active = sourceRef.current;
        return active.generation === candidate.generation
            && active.source === candidate.source
            && active.uid === candidate.uid;
    }, []);

    const setReadyState = useCallback((nextItems: CheckoutCartItem[], nextIssues: CartValidationIssue[] = []) => {
        const normalizedItems = normalizeContextItems(nextItems);
        setItems(normalizedItems);
        setTotalPrice(calculateTotal(normalizedItems));
        setValidationIssues(nextIssues);
        setStatus(nextIssues.length > 0 ? "validation-error" : normalizedItems.length > 0 ? "ready" : "empty");
        setError(null);
    }, []);

    const applyGuestPreview = useCallback((preview: GuestCartPreview) => {
        const nextItems = normalizeContextItems(preview.cartItems || []);
        const issues = preview.issues || [];
        setItems(nextItems);
        setTotalPrice(Number(preview.merchandiseTotal) || calculateTotal(nextItems));
        setDiscount(getPreviewDiscount(preview));
        setDiscountCode(preview.promotion?.valid ? preview.promotion.code || null : null);
        setValidationIssues(issues);
        setStatus(issues.length > 0 ? "validation-error" : nextItems.length > 0 ? "ready" : "empty");
        setError(null);
    }, []);

    const refreshGuestCart = useCallback(async (
        requestedDiscountCode?: string | null,
        expectedSource: CartSourceSnapshot = sourceRef.current,
    ): Promise<GuestCartPreview | null> => {
        const requestId = ++requestIdRef.current;
        const isActiveRequest = () => isCurrentSource(expectedSource) && requestId === requestIdRef.current;
        const localItems = readGuestCart();
        if (!isActiveRequest()) return null;
        setGuestItems(localItems);
        if (localItems.length === 0) {
            setItems([]);
            setTotalPrice(0);
            setDiscount(0);
            setDiscountCode(null);
            setValidationIssues([]);
            setError(null);
            setStatus("empty");
            setIsLoading(false);
            return null;
        }

        setIsLoading(true);
        setStatus("loading");
        try {
            const preview = await previewGuestCart(localItems, requestedDiscountCode || undefined);
            if (!isActiveRequest()) return null;
            applyGuestPreview(preview);
            return preview;
        } catch {
            if (isActiveRequest()) {
                setStatus("error");
                setError("Unable to load cart right now.");
                setIsLoading(false);
            }
            return null;
        } finally {
            if (isActiveRequest()) setIsLoading(false);
        }
    }, [applyGuestPreview, isCurrentSource]);

    const fetchCart = useCallback(async (requestedDiscountCode?: string | null): Promise<boolean> => {
        const expectedSource = sourceRef.current;
        if (!expectedSource.uid) {
            const preview = await refreshGuestCart(requestedDiscountCode, expectedSource);
            return preview !== null || readGuestCart().length === 0;
        }

        const requestId = ++requestIdRef.current;
        const isActiveRequest = () => isCurrentSource(expectedSource) && requestId === requestIdRef.current;
        setIsLoading(true);
        setStatus("loading");
        setError(null);
        try {
            const nextItems = await fetchCustomerCart(expectedSource.uid);
            if (!isActiveRequest()) return false;
            setGuestItems(readGuestCart());
            setReadyState(nextItems);
            return true;
        } catch (cartError) {
            if (!isActiveRequest()) return false;
            setStatus("error");
            setError("Unable to load cart items.");
            addToast("Cart", getErrorMessage(cartError, "Unable to load cart items."));
            return false;
        } finally {
            if (isActiveRequest()) setIsLoading(false);
        }
    }, [addToast, isCurrentSource, refreshGuestCart, setReadyState]);

    const addItem = useCallback(async (productId: number, quantity = 1): Promise<boolean> => {
        const normalizedQuantity = normalizeCartQuantity(quantity);
        const expectedSource = sourceRef.current;
        if (normalizedQuantity === null || !Number.isSafeInteger(productId) || productId <= 0) return false;
        try {
            if (expectedSource.uid) {
                await addItemsToCustomerCart(expectedSource.uid, [{
                    productId,
                    quantity: normalizedQuantity,
                    stock: normalizedQuantity,
                }]);
                if (!isCurrentSource(expectedSource)) return false;
                return await fetchCart();
            }
            addGuestCartItem({ productId, quantity: normalizedQuantity });
            if (!isCurrentSource(expectedSource)) return false;
            const preview = await refreshGuestCart(discountCode, expectedSource);
            if (preview === null) return false;
            const issues = preview.issues || [];
            if (preview.valid !== true || issues.length > 0) {
                setStatus(issues.length > 0 ? "validation-error" : "error");
                setError(
                    issues.length > 0
                        ? getCartValidationMessage(issues)
                        : "Unable to update cart right now.",
                );
                return false;
            }
            return true;
        } catch (cartError) {
            if (!isCurrentSource(expectedSource)) return false;
            setStatus("error");
            setError("Unable to update cart right now.");
            addToast("Cart", getErrorMessage(cartError, "Unable to update cart right now."));
            return false;
        }
    }, [addToast, discountCode, fetchCart, isCurrentSource, refreshGuestCart]);

    const updateQuantity = useCallback(async (itemId: number, quantity: number) => {
        const normalizedQuantity = normalizeCartQuantity(quantity);
        const expectedSource = sourceRef.current;
        if (normalizedQuantity === null || !isCurrentSource(expectedSource)) return;
        if (expectedSource.uid) {
            setItems((current) => applyOptimisticMutation(current, {
                type: "updateQuantity",
                cartItemId: itemId,
                quantity: normalizedQuantity,
            }));
            try {
                await updateCustomerCartItem(expectedSource.uid, itemId, normalizedQuantity);
                if (!isCurrentSource(expectedSource)) return;
                await fetchCart();
            } catch (cartError) {
                if (!isCurrentSource(expectedSource)) return;
                setError("Unable to save the quantity change.");
                setStatus("error");
                addToast("Cart", getErrorMessage(cartError, "Unable to save the quantity change."));
                if (isCurrentSource(expectedSource)) await fetchCart();
            }
            return;
        }

        const item = items.find((cartItem) => cartItem.cartItemId === itemId || cartItem.productId === itemId);
        if (!item) return;
        updateGuestCartItem(item.productId, normalizedQuantity);
        if (!isCurrentSource(expectedSource)) return;
        await refreshGuestCart(discountCode, expectedSource);
    }, [addToast, discountCode, fetchCart, isCurrentSource, items, refreshGuestCart]);

    const removeItem = useCallback((item: CheckoutCartItem) => setPendingRemoveItem(item), []);
    const cancelRemoveItem = useCallback(() => setPendingRemoveItem(null), []);

    const confirmRemoveItem = useCallback(async () => {
        if (!pendingRemoveItem) return;
        const item = pendingRemoveItem;
        const expectedSource = sourceRef.current;
        setPendingRemoveItem(null);
        setIsRemovingItem(true);
        try {
            if (expectedSource.uid) {
                await removeCustomerCartItem(item.cartItemId);
                if (!isCurrentSource(expectedSource)) return;
                await fetchCart();
            } else {
                removeGuestCartItem(item.productId);
                if (!isCurrentSource(expectedSource)) return;
                await refreshGuestCart(discountCode, expectedSource);
            }
            if (isCurrentSource(expectedSource)) addToast("Remove Cart item", "Item removed from cart successfully");
        } catch (cartError) {
            if (!isCurrentSource(expectedSource)) return;
            setStatus("error");
            setError("Unable to remove item from cart.");
            addToast("Remove Cart item", getErrorMessage(cartError, "Unable to remove item from cart."));
        } finally {
            if (isCurrentSource(expectedSource)) setIsRemovingItem(false);
        }
    }, [addToast, discountCode, fetchCart, isCurrentSource, pendingRemoveItem, refreshGuestCart]);

    const applyDiscount = useCallback(async (code: string, price: number): Promise<DiscountResult> => {
        const normalizedCode = code.trim();
        const expectedSource = sourceRef.current;
        try {
            if (!expectedSource.uid) {
                const preview = await refreshGuestCart(normalizedCode, expectedSource);
                if (!isCurrentSource(expectedSource)) {
                    return { status: "error", title: "Applying Coupon", message: "Cart source changed." };
                }
                if (preview?.promotion?.valid) {
                    return { status: "success", title: "Applying Coupon", message: "Coupon has been applied successfully" };
                }
                setDiscount(0);
                setDiscountCode(null);
                return { status: "error", title: "Applying Coupon", message: preview?.promotion?.message || "Discount code not found" };
            }
            const response = await applyCustomerDiscount(normalizedCode, price);
            if (!isCurrentSource(expectedSource)) {
                return { status: "error", title: "Applying Coupon", message: "Cart source changed." };
            }
            setDiscount(price - response.newPrice);
            setDiscountCode(normalizedCode);
            return { status: "success", title: "Applying Coupon", message: "Coupon has been applied successfully" };
        } catch (discountError) {
            if (!isCurrentSource(expectedSource)) {
                return { status: "error", title: "Applying Coupon", message: "Cart source changed." };
            }
            setDiscount(0);
            setDiscountCode(null);
            const statusCode = discountError && typeof discountError === "object" && "response" in discountError
                ? (discountError as { response?: { status?: number } }).response?.status
                : undefined;
            return {
                status: "error",
                title: "Applying Coupon",
                message: statusCode === 404
                    ? "Discount code not found"
                    : statusCode === 500
                      ? "Internal server error, please try again later"
                      : "Unable to apply coupon right now.",
            };
        }
    }, [isCurrentSource, refreshGuestCart]);

    const validateBeforeCheckout = useCallback(async () => {
        const expectedSource = sourceRef.current;
        if (!expectedSource.uid) {
            const preview = await refreshGuestCart(discountCode, expectedSource);
            return isCurrentSource(expectedSource) && preview?.valid === true && (preview.issues || []).length === 0;
        }
        try {
            setIsLoading(true);
            const validation = await validateCustomerCart(expectedSource.uid);
            if (!isCurrentSource(expectedSource)) return false;
            setReadyState(validation.cartItems, validation.issues);
            return validation.valid && validation.issues.length === 0;
        } catch (validationError) {
            if (!isCurrentSource(expectedSource)) return false;
            const response = validationError && typeof validationError === "object" && "response" in validationError
                ? (validationError as { response?: { data?: { issues?: CartValidationIssue[]; cartItems?: CheckoutCartItem[] } } }).response
                : undefined;
            const issues = response?.data?.issues || [];
            if (response?.data?.cartItems) setReadyState(response.data.cartItems, issues);
            else setValidationIssues(issues);
            setStatus(issues.length > 0 ? "validation-error" : "error");
            setError(issues.length > 0 ? getCartValidationMessage(issues) : "Unable to validate cart stock right now.");
            addToast("Checkout blocked", getCartValidationMessage(issues));
            return false;
        } finally {
            if (isCurrentSource(expectedSource)) setIsLoading(false);
        }
    }, [addToast, discountCode, isCurrentSource, refreshGuestCart, setReadyState]);

    const mergeGuestCart = useCallback(async (): Promise<CartMergeResult> => {
        if (mergePromiseRef.current) return mergePromiseRef.current;
        const expectedSource = sourceRef.current;
        const pendingItems = readGuestCart();
        if (!expectedSource.uid || pendingItems.length === 0) {
            return { accepted: [], rejected: pendingItems, complete: pendingItems.length === 0 };
        }

        const runMerge = async (): Promise<CartMergeResult> => {
            const accepted: GuestCartStorageItem[] = [];
            const rejected: GuestCartStorageItem[] = [];
            try {
                if (!isCurrentSource(expectedSource)) return { accepted, rejected: pendingItems, complete: false };
                setMergeStatus("loading");
                for (const item of pendingItems) {
                    if (!isCurrentSource(expectedSource)) return { accepted, rejected, complete: false };
                    try {
                        await addItemsToCustomerCart(expectedSource.uid!, [{ ...item, stock: item.quantity }]);
                        if (!isCurrentSource(expectedSource)) return { accepted, rejected, complete: false };
                        accepted.push(item);
                    } catch {
                        if (!isCurrentSource(expectedSource)) return { accepted, rejected, complete: false };
                        rejected.push(item);
                    }
                }

                if (!isCurrentSource(expectedSource)) return { accepted, rejected, complete: false };
                const currentItems = readGuestCart();
                const remainingItems = currentItems.filter((currentItem) =>
                    !accepted.some((acceptedItem) =>
                        acceptedItem.productId === currentItem.productId && acceptedItem.quantity === currentItem.quantity,
                    ),
                );
                replaceGuestCart(remainingItems);
                setGuestItems(remainingItems);
                if (rejected.length === 0) {
                    setMergeStatus("complete");
                    setError(null);
                } else {
                    setMergeStatus("partial");
                }
                await fetchCart();
                if (!isCurrentSource(expectedSource)) return { accepted, rejected, complete: false };
                if (rejected.length > 0) setError("Some guest cart items could not be merged. Retry to continue.");
                return { accepted, rejected, complete: rejected.length === 0 };
            } catch {
                if (isCurrentSource(expectedSource)) {
                    setMergeStatus("error");
                    setError("Unable to merge guest cart right now.");
                }
                return { accepted, rejected, complete: false };
            }
        };

        const mergePromise = runMerge();
        mergePromiseRef.current = mergePromise;
        void mergePromise.finally(() => {
            if (mergePromiseRef.current === mergePromise) mergePromiseRef.current = null;
        });
        return mergePromise;
    }, [fetchCart, isCurrentSource]);

    const onValidationRefresh = useCallback((nextCart: CheckoutCartItem[], issues: CartValidationIssue[]) => {
        setReadyState(nextCart, issues);
    }, [setReadyState]);

    useEffect(() => {
        const nextSource: CartSourceSnapshot = {
            source,
            uid,
            generation: sourceRef.current.generation + 1,
        };
        sourceRef.current = nextSource;
        requestIdRef.current += 1;
        mergePromiseRef.current = null;
        setItems([]);
        setTotalPrice(0);
        setDiscount(0);
        setDiscountCode(null);
        setValidationIssues([]);
        setError(null);
        setGuestItems(readGuestCart());
        setMergeStatus("idle");
        setPendingRemoveItem(null);
        setIsRemovingItem(false);
        if (authLoading) {
            setIsLoading(true);
            setStatus("loading");
            return;
        }
        void fetchCart(null);
    }, [authLoading, fetchCart, source, uid]);

    return (
        <CartContext.Provider
            value={{
                items,
                totalPrice,
                discount,
                discountCode,
                subtotal: totalPrice - discount,
                validationIssues,
                status,
                error,
                isGuest: !uid,
                guestItems,
                hasGuestItems: guestItems.length > 0,
                mergeStatus,
                isLoading,
                isRemovingItem,
                pendingRemoveItem,
                fetchCart: () => fetchCart(),
                addItem,
                updateQuantity,
                removeItem,
                confirmRemoveItem,
                cancelRemoveItem,
                applyDiscount,
                validateBeforeCheckout,
                mergeGuestCart,
                onValidationRefresh,
            }}
        >
            {children}
        </CartContext.Provider>
    );
};

export const useCart = (): CartContextValue => {
    const context = useContext(CartContext);
    if (!context) throw new Error("useCart must be used within a CartProvider");
    return context;
};
