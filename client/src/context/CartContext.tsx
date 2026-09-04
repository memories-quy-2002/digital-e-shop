import React, { createContext, useCallback, useContext, useEffect, useOptimistic, useState } from "react";
import http from "../lib/http";
import { useAuth } from "./AuthContext";
import { useToast } from "./ToastContext";
import type { CheckoutCartItem, CartValidationIssue } from "../features/orders/types";
import {
    normalizeCheckoutCartItems,
    getCartValidationMessage,
} from "../features/orders/types";

type DiscountResult = {
    status: "idle" | "success" | "error";
    title?: string;
    message?: string;
};

type CartMutation =
    | { type: "remove"; cartItemId: number }
    | { type: "updateQuantity"; cartItemId: number; quantity: number };

const applyCartMutation = (state: CheckoutCartItem[], mutation: CartMutation): CheckoutCartItem[] => {
    if (mutation.type === "remove") {
        return state.filter((item) => item.cartItemId !== mutation.cartItemId);
    }
    if (mutation.type === "updateQuantity") {
        return state.map((item) =>
            item.cartItemId === mutation.cartItemId ? { ...item, quantity: mutation.quantity } : item,
        );
    }
    return state;
};

interface CartContextValue {
    items: CheckoutCartItem[];
    totalPrice: number;
    discount: number;
    discountCode: string | null;
    subtotal: number;
    validationIssues: CartValidationIssue[];
    isLoading: boolean;
    isRemovingItem: boolean;
    pendingRemoveItem: CheckoutCartItem | null;
    fetchCart: () => Promise<void>;
    updateQuantity: (itemId: number, quantity: number) => Promise<void>;
    removeItem: (item: CheckoutCartItem) => void;
    confirmRemoveItem: () => Promise<void>;
    cancelRemoveItem: () => void;
    applyDiscount: (code: string, price: number) => Promise<DiscountResult>;
    validateBeforeCheckout: () => Promise<boolean>;
    onValidationRefresh: (nextCart: CheckoutCartItem[], issues: CartValidationIssue[]) => void;
}

const CartContext = createContext<CartContextValue | null>(null);

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { userData } = useAuth();
    const { addToast } = useToast();
    const uid = userData?.id || null;

    const [items, setItems] = useState<CheckoutCartItem[]>([]);
    const [totalPrice, setTotalPrice] = useState<number>(0);
    const [discount, setDiscount] = useState<number>(0);
    const [discountCode, setDiscountCode] = useState<string | null>(null);
    const [validationIssues, setValidationIssues] = useState<CartValidationIssue[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isRemovingItem, setIsRemovingItem] = useState(false);
    const [pendingRemoveItem, setPendingRemoveItem] = useState<CheckoutCartItem | null>(null);

    const subtotal = totalPrice - discount;

    const [optimisticItems, addOptimisticMutation] = useOptimistic(items, applyCartMutation);

    const fetchCart = useCallback(async () => {
        if (!uid) return;
        try {
            setIsLoading(true);
            const response = await http.get(`/api/cart/${uid}`);
            if (response.status === 200) {
                setItems(normalizeCheckoutCartItems(response.data.cartItems));
            }
        } catch {
            addToast("Cart", "Unable to load cart items.");
        } finally {
            setIsLoading(false);
        }
    }, [addToast, uid]);

    const updateQuantity = useCallback(async (itemId: number, quantity: number) => {
        if (!uid) return;
        addOptimisticMutation({ type: "updateQuantity", cartItemId: itemId, quantity });
        try {
            await http.put("/api/cart/", { uid, cartItemId: itemId, quantity });
            setItems((prev) =>
                prev.map((item) => (item.cartItemId === itemId ? { ...item, quantity } : item)),
            );
        } catch {
            addToast("Cart", "Unable to save the quantity change.");
        }
    }, [addToast, addOptimisticMutation, uid]);

    const removeItem = useCallback((item: CheckoutCartItem) => {
        setPendingRemoveItem(item);
    }, []);

    const cancelRemoveItem = useCallback(() => {
        setPendingRemoveItem(null);
    }, []);

    const confirmRemoveItem = useCallback(async () => {
        if (!pendingRemoveItem) return;
        addOptimisticMutation({ type: "remove", cartItemId: pendingRemoveItem.cartItemId });
        setPendingRemoveItem(null);
        setIsRemovingItem(true);
        try {
            const response = await http.delete("/api/cart/", {
                data: { cartItemId: pendingRemoveItem.cartItemId },
            });
            if (response.status === 200) {
                setItems((current) =>
                    current.filter((item) => item.cartItemId !== pendingRemoveItem.cartItemId),
                );
                addToast("Remove Cart item", "Item removed from cart successfully");
            }
        } catch {
            addToast("Remove Cart item", "Unable to remove item from cart.");
        } finally {
            setIsRemovingItem(false);
        }
    }, [addToast, addOptimisticMutation, pendingRemoveItem]);

    const applyDiscount = useCallback(async (code: string, price: number): Promise<DiscountResult> => {
        const normalizedCode = code.trim();
        try {
            const response = await http.post("/api/orders/discount", { discountCode: normalizedCode, price });
            if (response.status === 200) {
                const newPrice = response.data.newPrice;
                setDiscount(price - newPrice);
                setDiscountCode(normalizedCode);
                return {
                    status: "success",
                    title: "Applying Coupon",
                    message: "Coupon has been applied successfully",
                };
            }
            return { status: "error", title: "Applying Coupon", message: "Unable to apply coupon right now." };
        } catch (err: unknown) {
            setDiscount(0);
            setDiscountCode(null);
            if (err && typeof err === "object" && "response" in err) {
                const errorResponse = (err as { response: { status: number } }).response;
                if (errorResponse.status === 404) {
                    return { status: "error", title: "Applying Coupon", message: "Discount code not found" };
                }
                if (errorResponse.status === 500) {
                    return { status: "error", title: "Applying Coupon", message: "Internal server error, please try again later" };
                }
            }
            return { status: "error", title: "Applying Coupon", message: "Unable to apply coupon right now." };
        }
    }, []);

    const validateBeforeCheckout = useCallback(async () => {
        if (!uid) {
            addToast("Checkout blocked", "Please login before checkout.");
            return false;
        }
        try {
            setIsLoading(true);
            const response = await http.get(`/api/cart/${uid}/validation`);
            if (response.data.cartItems) {
                setItems(normalizeCheckoutCartItems(response.data.cartItems));
            }
            setValidationIssues([]);
            return response.status === 200 && response.data.valid === true;
        } catch (err: unknown) {
            if (err && typeof err === "object" && "response" in err) {
                const response = (err as {
                    response?: { data?: { msg?: string; issues?: CartValidationIssue[]; cartItems?: any[] } };
                }).response;
                if (response?.data?.cartItems) {
                    setItems(normalizeCheckoutCartItems(response.data.cartItems));
                }
                const issues: CartValidationIssue[] = response?.data?.issues || [];
                setValidationIssues(issues);
                addToast("Checkout blocked", getCartValidationMessage(issues));
            } else {
                setValidationIssues([]);
                addToast("Checkout blocked", "Unable to validate cart stock right now.");
            }
            return false;
        } finally {
            setIsLoading(false);
        }
    }, [addToast, uid]);

    const onValidationRefresh = useCallback((nextCart: CheckoutCartItem[], issues: CartValidationIssue[]) => {
        setItems(nextCart);
        setValidationIssues(issues);
    }, []);

    useEffect(() => {
        if (uid) {
            fetchCart();
        } else {
            setDiscount(0);
            setDiscountCode(null);
        }
    }, [fetchCart, uid]);

    useEffect(() => {
        const newTotal = optimisticItems.reduce(
            (acc, item) => acc + (item.sale_price || item.price) * item.quantity,
            0,
        );
        setTotalPrice(newTotal);
    }, [optimisticItems]);

    return (
        <CartContext.Provider
            value={{
                items: optimisticItems,
                totalPrice,
                discount,
                discountCode,
                subtotal,
                validationIssues,
                isLoading,
                isRemovingItem,
                pendingRemoveItem,
                fetchCart,
                updateQuantity,
                removeItem,
                confirmRemoveItem,
                cancelRemoveItem,
                applyDiscount,
                validateBeforeCheckout,
                onValidationRefresh,
            }}
        >
            {children}
        </CartContext.Provider>
    );
};

export const useCart = (): CartContextValue => {
    const context = useContext(CartContext);
    if (!context) {
        throw new Error("useCart must be used within a CartProvider");
    }
    return context;
};
