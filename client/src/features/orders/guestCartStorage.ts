export const GUEST_CART_STORAGE_KEY = "digital-e:guest-cart:v1";

export type GuestCartStorageItem = {
    productId: number;
    quantity: number;
};

export const MAX_GUEST_CART_ITEMS = 50;
export const MAX_GUEST_CART_QUANTITY = 99;

export const normalizeCartQuantity = (value: number): number | null => {
    if (!Number.isFinite(value)) return null;
    return Math.min(MAX_GUEST_CART_QUANTITY, Math.max(1, Math.floor(value)));
};

const isValidItem = (value: unknown): value is GuestCartStorageItem => {
    if (!value || typeof value !== "object") return false;
    const item = value as GuestCartStorageItem;
    return Number.isSafeInteger(item.productId)
        && item.productId > 0
        && Number.isFinite(item.quantity)
        && item.quantity > 0
        && normalizeCartQuantity(item.quantity) !== null;
};

const getStorage = (): Storage | null => {
    try {
        return typeof window === "undefined" ? null : window.localStorage;
    } catch {
        return null;
    }
};

const sanitizeItems = (value: unknown): GuestCartStorageItem[] => {
    if (!Array.isArray(value)) return [];
    const quantities = new Map<number, number>();
    for (const item of value) {
        if (!isValidItem(item)) continue;
        const quantity = (quantities.get(item.productId) || 0) + normalizeCartQuantity(item.quantity)!;
        quantities.set(item.productId, Math.min(quantity, MAX_GUEST_CART_QUANTITY));
    }
    return Array.from(quantities, ([productId, quantity]) => ({ productId, quantity })).slice(0, MAX_GUEST_CART_ITEMS);
};

const writeGuestCart = (items: GuestCartStorageItem[]) => {
    const storage = getStorage();
    if (!storage) return;
    try {
        if (items.length === 0) {
            storage.removeItem(GUEST_CART_STORAGE_KEY);
            return;
        }
        storage.setItem(GUEST_CART_STORAGE_KEY, JSON.stringify({ items }));
    } catch {
        // Browser privacy modes can deny storage access; keep the cart operation non-throwing.
    }
};

export const readGuestCart = (): GuestCartStorageItem[] => {
    const storage = getStorage();
    if (!storage) return [];
    try {
        const raw = storage.getItem(GUEST_CART_STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw) as { items?: unknown };
        const items = sanitizeItems(parsed?.items);
        if (Array.isArray(parsed?.items)) {
            writeGuestCart(items);
        } else {
            storage.removeItem(GUEST_CART_STORAGE_KEY);
        }
        return items;
    } catch {
        try {
            storage.removeItem(GUEST_CART_STORAGE_KEY);
        } catch {
            // Ignore storage cleanup failures for the same reason as read failures.
        }
        return [];
    }
};

export const addGuestCartItem = (item: GuestCartStorageItem): GuestCartStorageItem[] => {
    const quantity = normalizeCartQuantity(item.quantity);
    if (!Number.isSafeInteger(item.productId) || item.productId <= 0 || quantity === null || item.quantity <= 0) {
        return readGuestCart();
    }
    const items = readGuestCart();
    const existing = items.find((entry) => entry.productId === item.productId);
    if (existing) {
        existing.quantity = Math.min(existing.quantity + quantity, MAX_GUEST_CART_QUANTITY);
    } else if (items.length < MAX_GUEST_CART_ITEMS) {
        items.push({ productId: item.productId, quantity });
    }
    writeGuestCart(items);
    return items;
};

export const updateGuestCartItem = (productId: number, quantity: number): GuestCartStorageItem[] => {
    const normalizedQuantity = normalizeCartQuantity(quantity);
    if (!Number.isSafeInteger(productId) || productId <= 0 || normalizedQuantity === null || quantity <= 0) {
        return removeGuestCartItem(productId);
    }
    const items = readGuestCart().map((item) => item.productId === productId
        ? { ...item, quantity: normalizedQuantity }
        : item);
    writeGuestCart(items);
    return items;
};

export const removeGuestCartItem = (productId: number): GuestCartStorageItem[] => {
    const items = readGuestCart().filter((item) => item.productId !== productId);
    writeGuestCart(items);
    return items;
};

export const replaceGuestCart = (items: GuestCartStorageItem[]): GuestCartStorageItem[] => {
    const nextItems = sanitizeItems(items);
    writeGuestCart(nextItems);
    return nextItems;
};

export const clearGuestCart = () => writeGuestCart([]);
