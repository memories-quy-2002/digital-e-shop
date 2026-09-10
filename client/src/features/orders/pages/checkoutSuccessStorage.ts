export type CheckoutSuccessData = {
    orderId: string;
    totalPrice: number;
    discount: number;
    subtotal: number;
    itemsCount: number;
    placedAt: string;
    currency?: "USD" | "VND";
    paymentMethod?: "bank_transfer" | "cash" | "payos" | "stripe" | "card";
    email?: string;
    name?: string;
    address?: string;
    city?: string;
    country?: string;
    phone?: string;
    guestOrderToken?: string;
};

export type PendingCheckoutData = Omit<CheckoutSuccessData, "orderId" | "placedAt">;

type StoredCheckoutSuccessData = Omit<CheckoutSuccessData, "email" | "name" | "address" | "city" | "country" | "phone">;
type StoredPendingCheckoutData = Omit<PendingCheckoutData, "email" | "name" | "address" | "city" | "country" | "phone">;

export function maskPhoneNumber(phone: string): string {
    const digits = phone.replace(/\D/g, "");
    if (digits.length <= 4) {
        return "*".repeat(digits.length);
    }
    return `${"*".repeat(digits.length - 4)}${digits.slice(-4)}`;
}

function stripSensitiveCheckoutFields<T extends { email?: string; name?: string; address?: string; city?: string; country?: string; phone?: string }>(
    data: T,
): Omit<T, "email" | "name" | "address" | "city" | "country" | "phone"> {
    const { email, name, address, city, country, phone, ...safeData } = data;
    void email;
    void name;
    void address;
    void city;
    void country;
    void phone;
    return safeData;
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

export function writeCheckoutSuccess(data: CheckoutSuccessData) {
    const safeData: StoredCheckoutSuccessData = stripSensitiveCheckoutFields(data);
    sessionStorage.setItem("checkoutSuccess", JSON.stringify(safeData));
}

export function readPendingCheckout() {
    return readStoredJson<PendingCheckoutData>("checkoutPending", { clearOnError: true });
}

export function writePendingCheckout(data: PendingCheckoutData) {
    const safeData: StoredPendingCheckoutData = stripSensitiveCheckoutFields(data);
    sessionStorage.setItem("checkoutPending", JSON.stringify(safeData));
}

export function clearPendingCheckout() {
    sessionStorage.removeItem("checkoutPending");
}
