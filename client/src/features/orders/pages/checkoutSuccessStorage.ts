export type CheckoutSuccessData = {
    orderId: string;
    totalPrice: number;
    discount: number;
    subtotal: number;
    itemsCount: number;
    placedAt: string;
    paymentMethod?: "bank_transfer" | "cash" | "card";
    email?: string;
    name?: string;
    address?: string;
    city?: string;
    country?: string;
    phone?: string;
};

export type PendingCheckoutData = Omit<CheckoutSuccessData, "orderId" | "placedAt" | "paymentMethod">;

function readStoredJson<T>(key: string, { clearOnError = false }: { clearOnError?: boolean } = {}) {
    const rawValue = sessionStorage.getItem(key);

    if (!rawValue) {
        return null;
    }

    try {
        return JSON.parse(rawValue) as T;
    } catch {
        if (clearOnError) {
            sessionStorage.removeItem(key);
        }
        return null;
    }
}

export function readCheckoutSuccess() {
    return readStoredJson<CheckoutSuccessData>("checkoutSuccess");
}

export function readPendingCheckout() {
    return readStoredJson<PendingCheckoutData>("checkoutPending", { clearOnError: true });
}
