import { MAX_GUEST_CART_ITEMS, MAX_GUEST_CART_QUANTITY, type GuestCartStorageItem } from "./guestCartStorage";

const STORAGE_KEY = "digital-e:cart-merge-operation:v1";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type CartMergeOperation = {
    operationId: string;
    items: GuestCartStorageItem[];
};

const validItems = (value: unknown): value is GuestCartStorageItem[] => Array.isArray(value)
    && value.length > 0
    && value.length <= MAX_GUEST_CART_ITEMS
    && value.every((item) => Boolean(item && typeof item === "object")
        && Number.isSafeInteger((item as GuestCartStorageItem).productId)
        && Number((item as GuestCartStorageItem).productId) > 0
        && Number.isSafeInteger((item as GuestCartStorageItem).quantity)
        && Number((item as GuestCartStorageItem).quantity) > 0
        && Number((item as GuestCartStorageItem).quantity) <= MAX_GUEST_CART_QUANTITY);

export function readCartMergeOperation(): CartMergeOperation | null {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const value = JSON.parse(raw) as Partial<CartMergeOperation>;
        if (typeof value.operationId !== "string" || !UUID_PATTERN.test(value.operationId) || !validItems(value.items)) {
            localStorage.removeItem(STORAGE_KEY);
            return null;
        }
        return { operationId: value.operationId, items: value.items.map(({ productId, quantity }) => ({ productId, quantity })) };
    } catch {
        return null;
    }
}

export function getOrCreateCartMergeOperation(items: GuestCartStorageItem[]): CartMergeOperation {
    const pending = readCartMergeOperation();
    if (pending) return pending;
    const operation: CartMergeOperation = {
        operationId: crypto.randomUUID(),
        items: items.map(({ productId, quantity }) => ({ productId, quantity })),
    };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(operation)); } catch { /* The cart remains usable when storage is unavailable. */ }
    return operation;
}

export function clearCartMergeOperation() {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* Ignore browser storage restrictions. */ }
}
