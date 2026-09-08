import http from "../../lib/http";
import { normalizeCartQuantity } from "./guestCartStorage";
import {
    type CartValidationIssue,
    type CustomerCartValidation,
    type CheckoutCartItem,
    normalizeCheckoutCartItems,
    type CustomerOrder,
    type CustomerOrderDetail,
    type GuestCartItemInput,
    type GuestCartPreview,
} from "./types";

export type { CustomerOrder, CustomerOrderDetail } from "./types";

const normalizeCartItems = (items: unknown): CheckoutCartItem[] =>
    normalizeCheckoutCartItems(Array.isArray(items) ? items : []);

export async function fetchCustomerCart(uid: string): Promise<CheckoutCartItem[]> {
    const response = await http.get(`/api/cart/${uid}`);
    return normalizeCartItems(response.data.cartItems);
}

export async function updateCustomerCartItem(uid: string, cartItemId: number, quantity: number): Promise<void> {
    const normalizedQuantity = normalizeCartQuantity(quantity);
    if (normalizedQuantity === null) return;
    await http.put("/api/cart/", { uid, cartItemId, quantity: normalizedQuantity });
}

export async function removeCustomerCartItem(cartItemId: number): Promise<void> {
    await http.delete("/api/cart/", { data: { cartItemId } });
}

export async function validateCustomerCart(uid: string): Promise<CustomerCartValidation> {
    const response = await http.get(`/api/cart/${uid}/validation`);
    return {
        valid: response.data.valid === true,
        cartItems: normalizeCartItems(response.data.cartItems),
        issues: (response.data.issues || []) as CartValidationIssue[],
    };
}

export async function applyCustomerDiscount(code: string, price: number): Promise<{ newPrice: number }> {
    const response = await http.post("/api/orders/discount", { discountCode: code, price });
    return { newPrice: Number(response.data.newPrice) };
}

export async function fetchCustomerOrders(uid: string): Promise<CustomerOrder[]> {
    const response = await http.get(`/api/orders/user/${uid}`);
    return response.data.orders || [];
}

export async function fetchCustomerOrderDetail(orderId: number): Promise<CustomerOrderDetail | null> {
    const response = await http.get(`/api/orders/${orderId}`);
    return response.data.order || null;
}

export async function cancelCustomerOrder(orderId: number, reason?: string): Promise<CustomerOrder | null> {
    const response = await http.post(`/api/orders/${orderId}/cancel`, reason ? { reason } : {});
    return response.data.order || null;
}

export async function addItemsToCustomerCart(
    uid: string,
    items: Array<{ productId: number; quantity: number; stock: number }>,
): Promise<void> {
    await Promise.all(
        items.map((item) => {
            const quantity = normalizeCartQuantity(Math.min(item.quantity, item.stock));
            if (quantity === null) return Promise.resolve();
            return http.post("/api/cart/", { uid, pid: item.productId, quantity });
        }),
    );
}

export async function previewGuestCart(
    items: GuestCartItemInput[],
    discountCode?: string,
): Promise<GuestCartPreview> {
    const response = await http.post("/api/cart/guest/preview", {
        items,
        ...(discountCode ? { discountCode } : {}),
    });
    return {
        ...response.data,
        cartItems: normalizeCartItems(response.data.cartItems),
        issues: response.data.issues || [],
        promotion: response.data.promotion || {
            code: null,
            valid: false,
            discount: 0,
            discountPercent: null,
        },
    } as GuestCartPreview;
}
