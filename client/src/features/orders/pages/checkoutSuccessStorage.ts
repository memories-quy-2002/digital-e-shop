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

export function maskPhoneNumber(phone: string): string {
    const digits = phone.replace(/\D/g, "");
    if (digits.length <= 4) {
        return "*".repeat(digits.length);
    }
    return `${"*".repeat(digits.length - 4)}${digits.slice(-4)}`;
}

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
