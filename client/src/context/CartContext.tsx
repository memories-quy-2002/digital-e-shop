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
    clearGuestCart,
    MAX_GUEST_CART_QUANTITY,
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
    fetchCart: () => Promise<void>;
    addItem: (productId: number, quantity?: number) => Promise<void>;
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
    const sourceRef = useRef(source);
    const requestIdRef = useRef(0);

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

    const refreshGuestCart = useCallback(async (requestedDiscountCode?: string | null): Promise<GuestCartPreview | null> => {
        const localItems = readGuestCart();
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

        const requestId = ++requestIdRef.current;
        setIsLoading(true);
        setStatus("loading");
        try {
            const preview = await previewGuestCart(localItems, requestedDiscountCode || undefined);
            if (sourceRef.current !== "guest" || requestId !== requestIdRef.current) return preview;
            applyGuestPreview(preview);
            return preview;
        } catch {
            if (sourceRef.current === "guest" && requestId === requestIdRef.current) {
                setStatus("error");
                setError("Unable to load cart right now.");
                setIsLoading(false);
            }
            return null;
        } finally {
            if (sourceRef.current === "guest" && requestId === requestIdRef.current) setIsLoading(false);
        }
    }, [applyGuestPreview]);

    const fetchCart = useCallback(async (requestedDiscountCode?: string | null) => {
        const currentSource = uid ? `user:${uid}` : "guest";
        sourceRef.current = currentSource;
        const requestId = ++requestIdRef.current;
        setIsLoading(true);
        setStatus("loading");
        setError(null);

        if (!uid) {
            await refreshGuestCart(requestedDiscountCode);
            return;
        }

        try {
            const nextItems = await fetchCustomerCart(uid);
            if (sourceRef.current !== currentSource || requestId !== requestIdRef.current) return;
            setGuestItems(readGuestCart());
            setReadyState(nextItems);
        } catch (cartError) {
            if (sourceRef.current !== currentSource || requestId !== requestIdRef.current) return;
            setStatus("error");
            setError("Unable to load cart items.");
            addToast("Cart", getErrorMessage(cartError, "Unable to load cart items."));
        } finally {
            if (sourceRef.current === currentSource && requestId === requestIdRef.current) setIsLoading(false);
        }
    }, [addToast, refreshGuestCart, setReadyState, uid]);

    const addItem = useCallback(async (productId: number, quantity = 1) => {
        const boundedQuantity = Math.min(MAX_GUEST_CART_QUANTITY, Math.max(1, Math.floor(quantity)));
        if (!Number.isSafeInteger(productId) || productId <= 0) return;
        try {
            if (uid) {
                await addItemsToCustomerCart(uid, [{ productId, quantity: boundedQuantity, stock: boundedQuantity }]);
                await fetchCart();
                return;
            }
            addGuestCartItem({ productId, quantity: boundedQuantity });
            await refreshGuestCart(discountCode);
        } catch (cartError) {
            setStatus("error");
            setError("Unable to update cart right now.");
            addToast("Cart", getErrorMessage(cartError, "Unable to update cart right now."));
        }
    }, [addToast, discountCode, fetchCart, refreshGuestCart, uid]);

    const updateQuantity = useCallback(async (itemId: number, quantity: number) => {
        const boundedQuantity = Math.min(MAX_GUEST_CART_QUANTITY, Math.max(1, Math.floor(quantity)));
        if (uid) {
            setItems((current) => applyOptimisticMutation(current, { type: "updateQuantity", cartItemId: itemId, quantity: boundedQuantity }));
            try {
                await updateCustomerCartItem(uid, itemId, boundedQuantity);
                await fetchCart();
            } catch (cartError) {
                setError("Unable to save the quantity change.");
                setStatus("error");
                addToast("Cart", getErrorMessage(cartError, "Unable to save the quantity change."));
                await fetchCart();
            }
            return;
        }
        const item = items.find((cartItem) => cartItem.cartItemId === itemId || cartItem.productId === itemId);
        if (!item) return;
        updateGuestCartItem(item.productId, boundedQuantity);
        await refreshGuestCart(discountCode);
    }, [addToast, discountCode, fetchCart, items, refreshGuestCart, uid]);

    const removeItem = useCallback((item: CheckoutCartItem) => setPendingRemoveItem(item), []);
    const cancelRemoveItem = useCallback(() => setPendingRemoveItem(null), []);

    const confirmRemoveItem = useCallback(async () => {
        if (!pendingRemoveItem) return;
        const item = pendingRemoveItem;
        setPendingRemoveItem(null);
        setIsRemovingItem(true);
        try {
            if (uid) {
                await removeCustomerCartItem(item.cartItemId);
                await fetchCart();
            } else {
                removeGuestCartItem(item.productId);
                await refreshGuestCart(discountCode);
            }
            addToast("Remove Cart item", "Item removed from cart successfully");
        } catch (cartError) {
            setStatus("error");
            setError("Unable to remove item from cart.");
            addToast("Remove Cart item", getErrorMessage(cartError, "Unable to remove item from cart."));
        } finally {
            setIsRemovingItem(false);
        }
    }, [addToast, discountCode, fetchCart, pendingRemoveItem, refreshGuestCart, uid]);

    const applyDiscount = useCallback(async (code: string, price: number): Promise<DiscountResult> => {
        const normalizedCode = code.trim();
        try {
            if (!uid) {
                const preview = await refreshGuestCart(normalizedCode);
                if (preview?.promotion?.valid) {
                    return { status: "success", title: "Applying Coupon", message: "Coupon has been applied successfully" };
                }
                setDiscount(0);
                setDiscountCode(null);
                return { status: "error", title: "Applying Coupon", message: preview?.promotion?.message || "Discount code not found" };
            }
            const response = await applyCustomerDiscount(normalizedCode, price);
            setDiscount(price - response.newPrice);
            setDiscountCode(normalizedCode);
            return { status: "success", title: "Applying Coupon", message: "Coupon has been applied successfully" };
        } catch (discountError) {
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
    }, [refreshGuestCart, uid]);

    const validateBeforeCheckout = useCallback(async () => {
        if (!uid) {
            const preview = await refreshGuestCart(discountCode);
            return preview?.valid === true && (preview.issues || []).length === 0;
        }
        try {
            setIsLoading(true);
            const validation = await validateCustomerCart(uid);
            setReadyState(validation.cartItems, validation.issues);
            return validation.valid && validation.issues.length === 0;
        } catch (validationError) {
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
            setIsLoading(false);
        }
    }, [addToast, discountCode, refreshGuestCart, setReadyState, uid]);

    const mergeGuestCart = useCallback(async (): Promise<CartMergeResult> => {
        const pendingItems = readGuestCart();
        if (!uid || pendingItems.length === 0) {
            return { accepted: [], rejected: pendingItems, complete: pendingItems.length === 0 };
        }
        setMergeStatus("loading");
        const accepted: GuestCartStorageItem[] = [];
        const rejected: GuestCartStorageItem[] = [];
        for (const item of pendingItems) {
            try {
                await addItemsToCustomerCart(uid, [{ ...item, stock: item.quantity }]);
                accepted.push(item);
            } catch {
                rejected.push(item);
            }
        }
        if (rejected.length === 0) {
            clearGuestCart();
            setGuestItems([]);
            setMergeStatus("complete");
        } else {
            replaceGuestCart(rejected);
            setGuestItems(rejected);
            setMergeStatus("partial");
        }
        await fetchCart();
        if (rejected.length > 0) setError("Some guest cart items could not be merged. Retry to continue.");
        return { accepted, rejected, complete: rejected.length === 0 };
    }, [fetchCart, uid]);

    const onValidationRefresh = useCallback((nextCart: CheckoutCartItem[], issues: CartValidationIssue[]) => {
        setReadyState(nextCart, issues);
    }, [setReadyState]);

    useEffect(() => {
        sourceRef.current = source;
        setItems([]);
        setTotalPrice(0);
        setValidationIssues([]);
        setError(null);
        setGuestItems(readGuestCart());
        setMergeStatus("idle");
        if (authLoading) {
            setIsLoading(true);
            setStatus("loading");
            return;
        }
        if (!uid) {
            setDiscount(0);
            setDiscountCode(null);
            void fetchCart(null);
            return;
        }
        void fetchCart();
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
