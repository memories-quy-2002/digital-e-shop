import type { PaymentMethod } from "../constants";
import type { CurrencyCode } from "../../../constants/currency";

export type CheckoutSuccessData = {
    orderId: string;
    totalPrice: number;
    discount: number;
    subtotal: number;
    shippingFee?: number;
    itemsCount: number;
    placedAt?: string;
    currency?: CurrencyCode;
    paymentMethod?: PaymentMethod;
    email?: string;
    name?: string;
    address?: string;
    city?: string;
    country?: string;
    phone?: string;
    guestOrderToken?: string;
};

type StoredCheckoutSuccessData = Omit<CheckoutSuccessData, "email" | "name" | "address" | "city" | "country" | "phone">;

export type PurchasedCartSnapshotItem = { productId: number; quantity: number };
export type PendingCheckoutData = {
    version: 2;
    idempotencyKey: string;
    requestFingerprint: string;
    attemptId?: string;
    providerOrderCode?: string;
    guestOrderToken?: string;
    cartSnapshot: PurchasedCartSnapshotItem[];
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isPendingCheckout = (value: unknown): value is PendingCheckoutData => {
    if (!value || typeof value !== "object") return false;
    const record = value as Partial<PendingCheckoutData>;
    return record.version === 2
        && typeof record.idempotencyKey === "string" && UUID_PATTERN.test(record.idempotencyKey)
        && typeof record.requestFingerprint === "string" && record.requestFingerprint.length > 0
        && (record.attemptId === undefined || (typeof record.attemptId === "string" && UUID_PATTERN.test(record.attemptId)))
        && (record.providerOrderCode === undefined || /^\d{1,20}$/.test(record.providerOrderCode))
        && (record.guestOrderToken === undefined || (typeof record.guestOrderToken === "string" && record.guestOrderToken.length >= 32 && record.guestOrderToken.length <= 128))
        && Array.isArray(record.cartSnapshot)
        && record.cartSnapshot.every((item) => Boolean(item && typeof item === "object")
            && Number.isSafeInteger(item.productId) && item.productId > 0
            && Number.isSafeInteger(item.quantity) && item.quantity > 0);
};

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
    const stored = readStoredJson<unknown>("checkoutPending", { clearOnError: true });
    if (stored === null) return null;
    if (!isPendingCheckout(stored)) {
        sessionStorage.removeItem("checkoutPending");
        return null;
    }
    return stored;
}

export function writePendingCheckout(data: PendingCheckoutData) {
    if (!isPendingCheckout(data)) throw new TypeError("Invalid pending checkout data");
    const safeData: PendingCheckoutData = {
        version: 2,
        idempotencyKey: data.idempotencyKey,
        requestFingerprint: data.requestFingerprint,
        ...(data.attemptId ? { attemptId: data.attemptId } : {}),
        ...(data.providerOrderCode ? { providerOrderCode: data.providerOrderCode } : {}),
        ...(data.guestOrderToken ? { guestOrderToken: data.guestOrderToken } : {}),
        cartSnapshot: data.cartSnapshot.map(({ productId, quantity }) => ({ productId, quantity })),
    };
    sessionStorage.setItem("checkoutPending", JSON.stringify(safeData));
}

export function getOrCreatePayOSSubmission(requestFingerprint: string, cartSnapshot: PurchasedCartSnapshotItem[]): PendingCheckoutData {
    const current = readPendingCheckout();
    if (current?.requestFingerprint === requestFingerprint) return current;
    const next: PendingCheckoutData = {
        version: 2,
        idempotencyKey: crypto.randomUUID(),
        requestFingerprint,
        cartSnapshot: cartSnapshot.map(({ productId, quantity }) => ({ productId, quantity })),
    };
    writePendingCheckout(next);
    return next;
}

function canonicalizeCheckoutRequest(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(canonicalizeCheckoutRequest);
    if (value && typeof value === "object") {
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>)
                .filter(([, nested]) => nested !== undefined)
                .sort(([left], [right]) => left.localeCompare(right))
                .map(([key, nested]) => [key, canonicalizeCheckoutRequest(nested)]),
        );
    }
    return value;
}

export async function fingerprintPayOSRequest(request: unknown): Promise<string> {
    const canonicalJson = JSON.stringify(canonicalizeCheckoutRequest(request));
    const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalJson));
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function clearPendingCheckout() {
    sessionStorage.removeItem("checkoutPending");
}
